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
import { emptyAgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'
import type { AgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { pushToHost, type CanvasHostTransport } from './agent-canvas-host-sync'
import { syncSessionNodes, type CanvasLiveSession } from './agent-canvas-sessions'

type AgentCanvasState = Omit<AgentCanvasSnapshot, 'revision'> & {
  selectedNodeId: CanvasNodeId | null
  /** Host revision the local copy was last reconciled with. */
  hostRevision: number
  /** Note bodies as of `hostRevision`, so a rebase can tell user edits from agent edits. */
  hostNotes: Record<string, string>
  loaded: boolean
}

const LOCAL_RUNTIME = { kind: 'local' } as const

const transport: CanvasHostTransport = {
  get: (sinceRevision) =>
    callRuntimeRpc(
      LOCAL_RUNTIME,
      'canvas.get',
      sinceRevision === undefined ? {} : { sinceRevision }
    ),
  save: (input) => callRuntimeRpc(LOCAL_RUNTIME, 'canvas.save', input)
}

const initial = emptyAgentCanvasSnapshot()
const store = createStore<AgentCanvasState>(() => ({
  document: initial.document,
  viewport: initial.viewport,
  notes: initial.notes,
  selectedNodeId: null,
  hostRevision: 0,
  hostNotes: {},
  loaded: false
}))

let persistTimer: ReturnType<typeof setTimeout> | null = null
let pushing = false

function adoptHost(snapshot: AgentCanvasSnapshot, keepLocalEdits: boolean): void {
  store.setState((state) => ({
    ...(keepLocalEdits
      ? {}
      : { document: snapshot.document, viewport: snapshot.viewport, notes: snapshot.notes }),
    hostRevision: snapshot.revision,
    hostNotes: snapshot.notes,
    loaded: true,
    selectedNodeId: state.selectedNodeId
  }))
}

// Why: drags emit a frame per pointer move; debouncing keeps host writes off the hot path.
function schedulePersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    void flushToHost()
  }, 250)
}

async function flushToHost(): Promise<void> {
  if (pushing || !store.getState().loaded) {
    return
  }
  pushing = true
  const sent = store.getState()
  try {
    const saved = await pushToHost(
      transport,
      { document: sent.document, viewport: sent.viewport, notes: sent.notes },
      { revision: sent.hostRevision, notes: sent.hostNotes }
    )
    const now = store.getState()
    // Why: if the user kept editing while the save was in flight, keep those edits and push again.
    const editedMeanwhile =
      now.document !== sent.document || now.notes !== sent.notes || now.viewport !== sent.viewport
    adoptHost(saved, editedMeanwhile)
    if (editedMeanwhile) {
      schedulePersist()
    }
  } catch {
    // Host unreachable: local edits stay in memory and the next edit retries.
  } finally {
    pushing = false
  }
}

/** Loads the host copy once, then picks up agent note writes. Returns a stop function. */
export function startCanvasHostSync(intervalMs = 1500): () => void {
  let stopped = false
  const poll = async (): Promise<void> => {
    if (stopped || pushing || persistTimer !== null) {
      return
    }
    const { loaded, hostRevision } = store.getState()
    try {
      const result = await transport.get(loaded ? hostRevision : undefined)
      if (!stopped && !result.unchanged && persistTimer === null && !pushing) {
        adoptHost(result.snapshot, false)
      }
    } catch {
      // Host not ready yet; the next tick retries.
    }
  }
  void poll()
  const timer = setInterval(() => void poll(), intervalMs)
  return () => {
    stopped = true
    clearInterval(timer)
  }
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
  // Why: placing sessions before the host copy loads would save over the user's saved layout.
  if (!store.getState().loaded) {
    return
  }
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
