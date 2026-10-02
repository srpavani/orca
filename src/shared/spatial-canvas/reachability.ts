import { everyEdge, everyNode, findNode, sessionNode } from './levels'
import type { CanvasDocument, CanvasEdge, CanvasNode, CanvasNodeId } from './types'

/** One directly-connected session, as the caller sees it. */
export type CanvasSessionPeer = {
  sessionId: string
  nodeId: CanvasNodeId
  label: string
  roleId: string | null
  isLead: boolean
}

export type CanvasNotePeer = {
  nodeId: CanvasNodeId
  noteId: string
  displayName: string
  pinnedName: string | null
  readOnly: boolean
  /** 0 for a note attached to the caller, 1+ for notes reached through another note. */
  depth: number
}

export type CanvasPortalPeer = {
  nodeId: CanvasNodeId
  portalId: string
  url: string
}

/** What a session can see from the canvas. Computed, never stored. */
export type CanvasReach = {
  self: CanvasSessionPeer | null
  sessions: readonly CanvasSessionPeer[]
  notes: readonly CanvasNotePeer[]
  portals: readonly CanvasPortalPeer[]
}

const EMPTY_REACH: CanvasReach = { self: null, sessions: [], notes: [], portals: [] }

function edgeEndpoints(edge: CanvasEdge): readonly [CanvasNodeId, CanvasNodeId] {
  return [edge.fromNodeId, edge.toNodeId]
}

function edgeTouches(edge: CanvasEdge, nodeId: CanvasNodeId): boolean {
  return edge.fromNodeId === nodeId || edge.toNodeId === nodeId
}

function otherEndOf(edge: CanvasEdge, nodeId: CanvasNodeId): CanvasNodeId | null {
  const [from, to] = edgeEndpoints(edge)
  if (from === nodeId) {
    return to
  }
  if (to === nodeId) {
    return from
  }
  return null
}

/**
 * Directly connected node ids — one hop only, never transitive.
 *
 * This is the whole permission model: drawing an edge grants reachability and
 * deleting it revokes. Bridges contribute their far endpoint so levels see each
 * other, but the hop count does not grow.
 */
export function directNeighbourIds(
  document: CanvasDocument,
  nodeId: CanvasNodeId
): ReadonlySet<CanvasNodeId> {
  const neighbours = new Set<CanvasNodeId>()
  for (const edge of everyEdge(document)) {
    const other = otherEndOf(edge, nodeId)
    if (other !== null) {
      neighbours.add(other)
    }
  }
  for (const bridge of document.bridges) {
    if (bridge.fromNodeId === nodeId) {
      neighbours.add(bridge.toNodeId)
    } else if (bridge.toNodeId === nodeId) {
      neighbours.add(bridge.fromNodeId)
    }
  }
  return neighbours
}

/**
 * The note chain hanging off the caller: notes attached to the calling session,
 * plus notes attached to those notes, and so on. Unlike sessions, notes are
 * transitive — a chain is meant to be read and written as one document.
 *
 * `blocked` is the set of already-visited node ids; `depth` is reported so the
 * UI can indent the chain.
 */
function collectNoteChain(
  document: CanvasDocument,
  seedNodeIds: ReadonlySet<CanvasNodeId>
): readonly CanvasNotePeer[] {
  const byId = new Map(everyNode(document).map((node) => [node.id, node]))
  const notes: CanvasNotePeer[] = []
  const visited = new Set<CanvasNodeId>()
  const noteEdges = everyEdge(document).filter((edge) => edge.kind === 'note-note')

  const walk = (nodeIds: ReadonlySet<CanvasNodeId>, depth: number): void => {
    const next = new Set<CanvasNodeId>()
    for (const nodeId of nodeIds) {
      if (visited.has(nodeId)) {
        continue
      }
      visited.add(nodeId)
      const node = byId.get(nodeId)
      if (!node || node.content.kind !== 'note') {
        continue
      }
      notes.push({
        nodeId: node.id,
        noteId: node.content.noteId,
        displayName: node.content.pinnedName ?? deriveNoteName(node),
        pinnedName: node.content.pinnedName,
        readOnly: node.content.readOnly,
        depth
      })
      for (const edge of noteEdges) {
        if (!edgeTouches(edge, nodeId)) {
          continue
        }
        const other = otherEndOf(edge, nodeId)
        if (other !== null && !visited.has(other)) {
          next.add(other)
        }
      }
    }
    if (next.size > 0) {
      walk(next, depth + 1)
    }
  }

  walk(seedNodeIds, 0)
  return notes
}

function deriveNoteName(node: CanvasNode): string {
  return node.content.kind === 'note' ? `note-${node.content.noteId}` : node.id
}

function toSessionPeer(node: CanvasNode): CanvasSessionPeer | null {
  if (node.content.kind !== 'session') {
    return null
  }
  return {
    sessionId: node.content.sessionId,
    nodeId: node.id,
    label: node.content.label,
    roleId: node.content.roleId,
    isLead: node.content.isLead
  }
}

/**
 * Everything `callerSessionId` can address: itself, the sessions it is wired
 * to, the note chain hanging off those wires, and connected portals.
 *
 * An unknown caller gets an empty reach rather than every node, so a stale
 * session id can never fall open into full access.
 */
export function reachableFrom(document: CanvasDocument, callerSessionId: string): CanvasReach {
  const selfNode = sessionNode(document, callerSessionId)
  if (!selfNode) {
    return EMPTY_REACH
  }
  const neighbours = directNeighbourIds(document, selfNode.id)

  const sessions: CanvasSessionPeer[] = []
  const portals: CanvasPortalPeer[] = []
  const noteSeeds = new Set<CanvasNodeId>()

  for (const nodeId of neighbours) {
    const node = findNode(document, nodeId)
    if (!node) {
      continue
    }
    const peer = toSessionPeer(node)
    if (peer) {
      sessions.push(peer)
      continue
    }
    if (node.content.kind === 'portal') {
      portals.push({ nodeId: node.id, portalId: node.content.portalId, url: node.content.url })
      continue
    }
    if (node.content.kind === 'note') {
      noteSeeds.add(node.id)
    }
  }

  return {
    self: toSessionPeer(selfNode),
    sessions: sessions.sort((left, right) => (left.label < right.label ? -1 : 1)),
    notes: collectNoteChain(document, noteSeeds),
    portals
  }
}

/** True when an edge directly joins the two sessions. Used to gate `ask`. */
export function canReach(
  document: CanvasDocument,
  callerSessionId: string,
  targetSessionId: string
): boolean {
  const caller = sessionNode(document, callerSessionId)
  const target = sessionNode(document, targetSessionId)
  if (!caller || !target) {
    return false
  }
  return directNeighbourIds(document, caller.id).has(target.id)
}

/** Peer labels are addresses; duplicates must be refused at creation time. */
export function duplicateSessionLabel(
  document: CanvasDocument,
  label: string,
  exceptSessionId?: string
): boolean {
  const needle = label.trim().toLowerCase()
  return everyNode(document).some(
    (node) =>
      node.content.kind === 'session' &&
      node.content.label.trim().toLowerCase() === needle &&
      node.content.sessionId !== exceptSessionId
  )
}
