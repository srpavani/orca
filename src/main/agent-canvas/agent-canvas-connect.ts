import type { AgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { bridgeBetween, bridgeSessions } from '../../shared/spatial-canvas/bridges'
import { connectNodes } from '../../shared/spatial-canvas/document'
import { everyEdge, sessionNode } from '../../shared/spatial-canvas/levels'
import type { CanvasDocument, CanvasNodeId } from '../../shared/spatial-canvas/types'
import { AgentCanvasAccessError, resolveConnectedPeer, viewPeers } from './agent-canvas-peers'

type Endpoint = { sessionId: string; label: string }

function resolveTeamMember(
  snapshot: AgentCanvasSnapshot,
  callerSessionId: string,
  name: string
): Endpoint {
  const self = viewPeers(snapshot, callerSessionId).self
  if (name === callerSessionId || name.trim().toLowerCase() === self.label.trim().toLowerCase()) {
    return { sessionId: callerSessionId, label: self.label }
  }
  return resolveConnectedPeer(snapshot, callerSessionId, name)
}

function linked(document: CanvasDocument, a: CanvasNodeId, b: CanvasNodeId): boolean {
  return (
    bridgeBetween(document, a, b) !== null ||
    everyEdge(document).some(
      (edge) =>
        (edge.fromNodeId === a && edge.toNodeId === b) ||
        (edge.fromNodeId === b && edge.toNodeId === a)
    )
  )
}

export type AgentCanvasConnectResult = {
  from: Endpoint
  to: Endpoint
  /** False when the two were already joined; nothing changed. */
  created: boolean
  via: 'wire' | 'bridge'
}

/**
 * Wires two sessions of the caller's team, like the reference's `connect`.
 * Why only the caller and its direct peers: the caller can already reach both,
 * so joining them grants nothing it did not have — it cannot pull in strangers.
 * Sessions on different floors get a bridge, the only grant that crosses floors.
 */
export function connectTeamSessions(
  snapshot: AgentCanvasSnapshot,
  callerSessionId: string,
  fromName: string,
  toName: string,
  now: string
): { document: CanvasDocument; result: AgentCanvasConnectResult } {
  const from = resolveTeamMember(snapshot, callerSessionId, fromName)
  const to = resolveTeamMember(snapshot, callerSessionId, toName)
  if (from.sessionId === to.sessionId) {
    throw new AgentCanvasAccessError(
      'canvas_peer_ambiguous',
      'A session cannot be wired to itself.'
    )
  }
  const document = snapshot.document
  const fromNode = sessionNode(document, from.sessionId)
  const toNode = sessionNode(document, to.sessionId)
  if (fromNode === null || toNode === null) {
    throw new AgentCanvasAccessError(
      'canvas_peer_not_found',
      `"${fromNode === null ? from.label : to.label}" has no card on this canvas.`
    )
  }
  if (linked(document, fromNode.id, toNode.id)) {
    return { document, result: { from, to, created: false, via: 'wire' } }
  }
  const wired = connectNodes(document, fromNode.id, toNode.id, now)
  if (wired !== null) {
    return { document: wired.document, result: { from, to, created: true, via: 'wire' } }
  }
  const bridged = bridgeSessions(document, fromNode.id, toNode.id)
  if ('refused' in bridged) {
    throw new AgentCanvasAccessError(
      'canvas_peer_not_connected',
      `"${from.label}" and "${to.label}" could not be joined (${bridged.refused}).`
    )
  }
  return { document: bridged.document, result: { from, to, created: true, via: 'bridge' } }
}
