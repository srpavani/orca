import { everyNode, findNode, levelsOf, sessionNode } from '../../shared/spatial-canvas/levels'
import { reachableFrom, type CanvasReach } from '../../shared/spatial-canvas/reachability'
import {
  sonarBoard,
  type SonarActivityState,
  type SonarSample
} from '../../shared/spatial-canvas/sonar'
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

export type AgentCanvasStatusRow = {
  sessionId: string
  label: string
  state: SonarActivityState
  /** Milliseconds since this terminal last produced output; null when it never has. */
  quietForMs: number | null
  isLead: boolean
  watched: boolean
}

export type AgentCanvasTerminalSample = {
  tabId: string
  connected: boolean
  lastOutputAt: number | null
  agentIdentity?: string
}

/**
 * What the team is doing: the caller itself plus everyone it can ask. Reading
 * this costs nothing on the peers' side — no prompt is sent — which is what
 * makes it the right first move before asking or waiting on someone.
 */
export function viewStatus(
  snapshot: AgentCanvasSnapshot,
  callerSessionId: string,
  terminals: readonly AgentCanvasTerminalSample[],
  now: number
): AgentCanvasStatusRow[] {
  const reach = requireCaller(snapshot, callerSessionId)
  const peers = [reach.self!, ...reach.sessions]
  const byId = new Map(terminals.map((terminal) => [terminal.tabId, terminal]))
  const samples: SonarSample[] = peers.map((peer) => {
    const terminal = byId.get(peer.sessionId)
    return {
      sessionId: peer.sessionId,
      label: peer.label,
      connected: terminal?.connected ?? false,
      // A plain shell has no turn to finish, so it never reports as waiting.
      lastOutputAt: terminal?.agentIdentity ? terminal.lastOutputAt : null
    }
  })
  const board = new Map(sonarBoard(samples, now).map((row) => [row.sessionId, row]))
  const nodes = new Map(
    everyNode(snapshot.document)
      .filter((node) => node.content.kind === 'session')
      .map((node) => [
        node.content.kind === 'session' ? node.content.sessionId : node.id,
        node.content
      ])
  )
  return peers.map((peer) => {
    const content = nodes.get(peer.sessionId)
    return {
      sessionId: peer.sessionId,
      label: peer.label,
      state: board.get(peer.sessionId)?.state ?? 'gone',
      quietForMs: board.get(peer.sessionId)?.quietForMs ?? null,
      isLead: peer.isLead,
      watched: content?.kind === 'session' ? content.watched !== false : true
    }
  })
}

/** Floors as the calling agent sees them: name, branch, occupancy, and which one it is on. */
export function viewFloors(
  document: AgentCanvasSnapshot['document'],
  caller: CanvasSessionPeer
): AgentCanvasFloorView[] {
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
