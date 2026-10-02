import { everyNode, findNode, levelsOf, sessionNode } from '../../shared/spatial-canvas/levels'
import { reachableFrom, type CanvasReach } from '../../shared/spatial-canvas/reachability'
import type { AgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import type { CanvasNotePeer, CanvasSessionPeer } from '../../shared/spatial-canvas/reachability'
import type { AgentCanvasErrorCode } from '../../shared/spatial-canvas/agent-canvas-error-codes'

export class AgentCanvasAccessError extends Error {
  constructor(
    readonly code: AgentCanvasErrorCode,
    message: string
  ) {
    super(message)
  }
}

export type AgentCanvasNoteView = CanvasNotePeer & { body: string }

export type AgentCanvasFloorView = {
  id: string | null
  name: string
  /** Git branch this floor is pinned to, when it is one branch's floor. */
  branch: string | null
  sessions: number
  current: boolean
}

export type AgentCanvasPeerView = {
  self: CanvasSessionPeer
  sessions: readonly CanvasSessionPeer[]
  notes: readonly AgentCanvasNoteView[]
  floors: readonly AgentCanvasFloorView[]
}

/** Floors as the calling agent sees them: name, branch, occupancy, and which one it is on. */
export function viewFloors(
  document: AgentCanvasSnapshot['document'],
  caller: CanvasSessionPeer
): AgentCanvasFloorView[] {
  const own = document.root.nodes.find((node) => node.id === caller.nodeId)
  void own
  return levelsOf(document).map((level) => ({
    id: level.id,
    name: level.name,
    branch:
      level.id === null
        ? null
        : (document.levels.find((entry) => entry.id === level.id)?.branch ?? null),
    sessions: level.contents.nodes.filter((node) => node.content.kind === 'session').length,
    current: level.contents.nodes.some((node) => node.id === caller.nodeId)
  }))
}

function requireCaller(snapshot: AgentCanvasSnapshot, callerSessionId: string): CanvasReach {
  const reach = reachableFrom(snapshot.document, callerSessionId)
  if (reach.self === null) {
    throw new AgentCanvasAccessError(
      'canvas_caller_not_on_canvas',
      'This terminal is not on the Agent Canvas, and Orca could not place it (the terminal was not found).'
    )
  }
  return reach
}

/** What the calling agent may see: itself, wired sessions, its note chain, and the floors. */
export function viewPeers(
  snapshot: AgentCanvasSnapshot,
  callerSessionId: string
): AgentCanvasPeerView {
  const reach = requireCaller(snapshot, callerSessionId)
  return {
    self: reach.self!,
    sessions: reach.sessions,
    notes: reach.notes.map((note) => ({ ...note, body: snapshot.notes[note.noteId] ?? '' })),
    floors: viewFloors(snapshot.document, reach.self!)
  }
}

const normalise = (value: string): string => value.trim().toLowerCase()

/**
 * Resolves a peer by label (case-insensitive) or session id. Labels are the
 * agent-facing address; a label shared by two wired peers is refused instead of guessed.
 */
export function resolveConnectedPeer(
  snapshot: AgentCanvasSnapshot,
  callerSessionId: string,
  target: string
): CanvasSessionPeer {
  const reach = requireCaller(snapshot, callerSessionId)
  const byId = reach.sessions.find((peer) => peer.sessionId === target)
  if (byId) {
    return byId
  }
  const matches = reach.sessions.filter((peer) => normalise(peer.label) === normalise(target))
  if (matches.length === 1) {
    return matches[0]
  }
  if (matches.length > 1) {
    throw new AgentCanvasAccessError(
      'canvas_peer_ambiguous',
      `More than one connected session is named "${target}". Rename one on the canvas, or address it by session id.`
    )
  }
  const existsOnCanvas = everyNode(snapshot.document).some(
    (node) =>
      node.content.kind === 'session' &&
      (node.content.sessionId === target || normalise(node.content.label) === normalise(target))
  )
  if (existsOnCanvas) {
    throw new AgentCanvasAccessError(
      'canvas_peer_not_connected',
      `"${target}" is on the canvas but not wired to you. Ask the user to draw a wire between the two sessions.`
    )
  }
  throw new AgentCanvasAccessError(
    'canvas_peer_not_found',
    `No session named "${target}" is on the canvas.`
  )
}

/** Resolves a note in the caller's chain by display name or note id. */
export function resolveConnectedNote(
  snapshot: AgentCanvasSnapshot,
  callerSessionId: string,
  target: string
): AgentCanvasNoteView {
  const { notes } = viewPeers(snapshot, callerSessionId)
  const note =
    notes.find((candidate) => candidate.noteId === target) ??
    notes.find((candidate) => normalise(candidate.displayName) === normalise(target))
  if (note) {
    return note
  }
  const onCanvas = everyNode(snapshot.document).some(
    (node) => node.content.kind === 'note' && node.content.noteId === target
  )
  throw new AgentCanvasAccessError(
    onCanvas ? 'canvas_note_not_connected' : 'canvas_note_not_found',
    onCanvas
      ? `Note "${target}" is not connected to you.`
      : `No connected note matches "${target}".`
  )
}

/** Writes a note body after the same reachability check reads use. */
export function writeConnectedNote(
  snapshot: AgentCanvasSnapshot,
  callerSessionId: string,
  target: string,
  body: string,
  mode: 'replace' | 'append'
): AgentCanvasSnapshot {
  const note = resolveConnectedNote(snapshot, callerSessionId, target)
  if (note.readOnly) {
    throw new AgentCanvasAccessError(
      'canvas_note_read_only',
      `Note "${note.displayName}" is read-only.`
    )
  }
  const current = snapshot.notes[note.noteId] ?? ''
  const next = mode === 'append' ? (current ? `${current}\n${body}` : body) : body
  return { ...snapshot, notes: { ...snapshot.notes, [note.noteId]: next } }
}

/** The session label as the target sees it, for the reply header the caller gets back. */
export function sessionLabelOf(snapshot: AgentCanvasSnapshot, sessionId: string): string | null {
  const node = sessionNode(snapshot.document, sessionId)
  if (!node) {
    return null
  }
  const found = findNode(snapshot.document, node.id)
  return found?.content.kind === 'session' ? found.content.label : null
}
