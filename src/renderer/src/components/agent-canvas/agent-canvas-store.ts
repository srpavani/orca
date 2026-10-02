import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import {
  addNode,
  connectNodes,
  createNoteNode,
  newCanvasId,
  patchNodeFrame,
  removeEdge,
  removeNode
} from '../../../../shared/spatial-canvas/document'
import type {
  CanvasDocument,
  CanvasEdgeId,
  CanvasNodeId,
  CanvasPoint,
  CanvasViewport
} from '../../../../shared/spatial-canvas/types'
import {
  AGENT_CANVAS_STORAGE_KEY,
  parsePersistedAgentCanvas,
  serializeAgentCanvas,
  type PersistedAgentCanvas
} from './agent-canvas-persistence'
import { syncSessionNodes, type CanvasLiveSession } from './agent-canvas-sessions'

type AgentCanvasState = PersistedAgentCanvas & {
  selectedNodeId: CanvasNodeId | null
}

function readStoredCanvas(): PersistedAgentCanvas {
  try {
    return parsePersistedAgentCanvas(localStorage.getItem(AGENT_CANVAS_STORAGE_KEY))
  } catch {
    return parsePersistedAgentCanvas(null)
  }
}

const store = createStore<AgentCanvasState>(() => ({ ...readStoredCanvas(), selectedNodeId: null }))

let persistTimer: ReturnType<typeof setTimeout> | null = null

// Why: drags emit a frame per pointer move; debouncing keeps localStorage
// writes off the hot path while still landing within a fraction of a second.
function schedulePersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    const { document, viewport, notes } = store.getState()
    try {
      localStorage.setItem(
        AGENT_CANVAS_STORAGE_KEY,
        serializeAgentCanvas({ document, viewport, notes })
      )
    } catch {
      // Storage full or unavailable: the canvas still works for this session.
    }
  }, 250)
}

function updateDocument(update: (document: CanvasDocument) => CanvasDocument): void {
  const current = store.getState().document
  const next = update(current)
  if (next !== current) {
    store.setState({ document: next })
    schedulePersist()
  }
}

export function useAgentCanvas<T>(selector: (state: AgentCanvasState) => T): T {
  return useStore(store, selector)
}

export function getAgentCanvasState(): AgentCanvasState {
  return store.getState()
}

export function setCanvasViewport(viewport: CanvasViewport): void {
  store.setState({ viewport })
  schedulePersist()
}

export function syncCanvasSessions(sessions: readonly CanvasLiveSession[]): void {
  updateDocument((document) => syncSessionNodes(document, sessions))
}

export function moveCanvasNode(nodeId: CanvasNodeId, at: CanvasPoint): void {
  updateDocument((document) => patchNodeFrame(document, nodeId, at))
}

export function resizeCanvasNode(
  nodeId: CanvasNodeId,
  size: { width: number; height: number }
): void {
  updateDocument((document) => patchNodeFrame(document, nodeId, size))
}

export function selectCanvasNode(nodeId: CanvasNodeId | null): void {
  store.setState({ selectedNodeId: nodeId })
}

/** Returns false when the pair cannot be wired (same node, duplicate, or unsupported kinds). */
export function connectCanvasNodes(fromNodeId: CanvasNodeId, toNodeId: CanvasNodeId): boolean {
  const result = connectNodes(
    store.getState().document,
    fromNodeId,
    toNodeId,
    new Date().toISOString()
  )
  if (result === null) {
    return false
  }
  store.setState({ document: result.document })
  schedulePersist()
  return true
}

export function disconnectCanvasEdge(edgeId: CanvasEdgeId): void {
  updateDocument((document) => removeEdge(document, edgeId))
}

export function addCanvasNote(at: CanvasPoint): CanvasNodeId {
  const noteId = newCanvasId()
  const node = createNoteNode({ noteId, at })
  store.setState(({ document, notes }) => ({
    document: addNode(document, node),
    notes: { ...notes, [noteId]: '' },
    selectedNodeId: node.id
  }))
  schedulePersist()
  return node.id
}

export function writeCanvasNote(noteId: string, body: string): void {
  store.setState(({ notes }) => ({ notes: { ...notes, [noteId]: body } }))
  schedulePersist()
}

/** Removing a node also drops every wire attached to it, revoking that access. */
export function removeCanvasNode(nodeId: CanvasNodeId): void {
  store.setState(({ document, notes, selectedNodeId }) => {
    const node = [...document.root.nodes, ...document.levels.flatMap((level) => level.nodes)].find(
      (candidate) => candidate.id === nodeId
    )
    const nextNotes = { ...notes }
    if (node?.content.kind === 'note') {
      delete nextNotes[node.content.noteId]
    }
    return {
      document: removeNode(document, nodeId),
      notes: nextNotes,
      selectedNodeId: selectedNodeId === nodeId ? null : selectedNodeId
    }
  })
  schedulePersist()
}
