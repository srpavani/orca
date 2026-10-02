import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import {
  addNode,
  connectNodes,
  createNoteNode,
  createSessionNode,
  newCanvasId,
  patchNodeFrame,
  removeEdge,
  removeNode
} from '../../../../shared/spatial-canvas/document'
import { levelContents, sessionNode } from '../../../../shared/spatial-canvas/levels'
import type { WorkspaceHooks } from '../../../../shared/spatial-canvas/floor-hooks'
import type { CanvasAppearance } from '../../../../shared/spatial-canvas/canvas-appearance'
import {
  gridSlot,
  syncSessionNodes,
  type CanvasLiveSession
} from '../../../../shared/spatial-canvas/session-placement'
import {
  patchSessionFlags,
  setNoteColor as setNoteColorInDocument,
  type SessionFlagPatch
} from '../../../../shared/spatial-canvas/node-flags'
import type {
  CanvasDocument,
  CanvasEdgeId,
  CanvasLevelId,
  CanvasNodeId,
  CanvasNoteColor,
  CanvasPoint,
  CanvasViewport
} from '../../../../shared/spatial-canvas/types'
import { emptyAgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'
import type { AgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { pushToHost, type CanvasHostTransport } from './agent-canvas-host-sync'

type AgentCanvasState = Omit<AgentCanvasSnapshot, 'revision'> & {
  selectedNodeId: CanvasNodeId | null
  /** Every selected node; a marquee fills this, and `selectedNodeId` stays the primary. */
  selectedNodeIds: readonly CanvasNodeId[]
  /** Host revision the local copy was last reconciled with. */
  hostRevision: number
  /** Note bodies as of `hostRevision`, so a rebase can tell user edits from agent edits. */
  hostNotes: Record<string, string>
  loaded: boolean
  /** The floor being shown; null is the ground level. View state only, never persisted. */
  activeLevelId: string | null
  /** Drawing tool armed on the toolbar; null means pointer/wire mode. */
  drawTool: 'rect' | 'ellipse' | 'arrow' | 'freehand' | null
  /** True while the floor stack is engaged. */
  floorOverview: boolean
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
  selectedNodeIds: [],
  hostRevision: 0,
  hostNotes: {},
  loaded: false,
  activeLevelId: null,
  drawTool: null,
  floorOverview: false
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

export function updateDocument(update: (document: CanvasDocument) => CanvasDocument): void {
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

/**
 * Puts a terminal created from the board onto the floor the user is looking at.
 * The background sync would otherwise file it on its branch's floor, which is
 * not where the user is, so the card they just asked for never appears.
 */
export function placeCanvasSessionAt(
  sessionId: string,
  label: string,
  levelId: CanvasLevelId
): string | null {
  const existing = sessionNode(store.getState().document, sessionId)
  if (existing) {
    return existing.id
  }
  const floor = levelContents(store.getState().document, levelId) ?? store.getState().document.root
  const node = createSessionNode({
    sessionId,
    label,
    at: gridSlot(floor.nodes.filter((item) => item.content.kind === 'session').length)
  })
  // Why the name is pinned: the board created this card with the name the user
  // typed, so a later terminal-title change must not rename it.
  const pinned = {
    ...node,
    content: { ...node.content, name: label }
  }
  store.setState(({ document }) => ({
    document: addNode(document, pinned, levelId),
    selectedNodeId: pinned.id,
    selectedNodeIds: [pinned.id]
  }))
  schedulePersist()
  return pinned.id
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

/** Selects exactly one node (or clears). The last node named is the primary. */
export function selectCanvasNode(nodeId: CanvasNodeId | null): void {
  store.setState({
    selectedNodeId: nodeId,
    selectedNodeIds: nodeId === null ? [] : [nodeId]
  })
}

/** Replaces the selection, as a marquee does. The last id becomes the primary. */
export function selectCanvasNodes(nodeIds: readonly CanvasNodeId[]): void {
  store.setState({
    selectedNodeIds: [...nodeIds],
    selectedNodeId: nodeIds.at(-1) ?? null
  })
}

/** Shift-click: adds or removes one node without disturbing the rest. */
export function toggleCanvasNodeSelection(nodeId: CanvasNodeId): void {
  store.setState(({ selectedNodeIds }) => {
    const next = selectedNodeIds.includes(nodeId)
      ? selectedNodeIds.filter((id) => id !== nodeId)
      : [...selectedNodeIds, nodeId]
    return { selectedNodeIds: next, selectedNodeId: next.at(-1) ?? null }
  })
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

export function addCanvasNote(at: CanvasPoint, color: CanvasNoteColor = 'yellow'): CanvasNodeId {
  const noteId = newCanvasId()
  const node = createNoteNode({ noteId, at, color })
  store.setState(({ document, notes, activeLevelId }) => ({
    document: addNode(document, node, activeLevelId),
    notes: { ...notes, [noteId]: '' },
    selectedNodeId: node.id,
    selectedNodeIds: [node.id]
  }))
  schedulePersist()
  return node.id
}

/** Recolours a sticky note. Paper colour is a property of the node, so it lives on the document. */
/** Replaces the workspace's floor hooks. Hooks are shared by every floor. */
export function setCanvasHooks(hooks: WorkspaceHooks): void {
  updateDocument((document) => ({ ...document, hooks }))
}

/** Replaces the board's appearance. */
export function setCanvasAppearance(appearance: CanvasAppearance): void {
  updateDocument((document) => ({ ...document, appearance }))
}

/** Flips a session card's Sonar watch or its lead flag. */
export function setCanvasSessionFlags(nodeId: CanvasNodeId, patch: SessionFlagPatch): void {
  updateDocument((document) => patchSessionFlags(document, nodeId, patch))
}

export function setCanvasNoteColor(nodeId: CanvasNodeId, color: CanvasNoteColor): void {
  updateDocument((document) => setNoteColorInDocument(document, nodeId, color))
}

export function writeCanvasNote(noteId: string, body: string): void {
  store.setState(({ notes }) => ({ notes: { ...notes, [noteId]: body } }))
  schedulePersist()
}

/** Removing a node also drops every wire attached to it, revoking that access. */
export function removeCanvasNode(nodeId: CanvasNodeId): void {
  store.setState(({ document, notes, selectedNodeId, selectedNodeIds }) => {
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
      selectedNodeIds: selectedNodeIds.filter((id) => id !== nodeId),
      selectedNodeId: selectedNodeId === nodeId ? null : selectedNodeId
    }
  })
  schedulePersist()
}

/** View-only state (active floor, armed draw tool); never persisted to the host. */
export function setCanvasViewState(
  patch: Partial<
    Pick<AgentCanvasState, 'activeLevelId' | 'drawTool' | 'selectedNodeId' | 'floorOverview'>
  >
): void {
  store.setState(patch)
}
