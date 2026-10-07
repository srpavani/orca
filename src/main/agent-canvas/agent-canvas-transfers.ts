import { everyEdge, sessionNode } from '../../shared/spatial-canvas/levels'
import type { CanvasDocument, CanvasEdgeId } from '../../shared/spatial-canvas/types'

/**
 * Why a floor on how long a wire stays lit: the canvas reads this on its 1.5s
 * poll, so a quick `check` would otherwise light and clear between two polls
 * and the user would never see the message travel.
 */
const MIN_LIT_MS = 2000

/** Edge id -> number of transfers in flight on it, and when the last one ended. */
const inFlight = new Map<CanvasEdgeId, number>()
const litUntil = new Map<CanvasEdgeId, number>()

/** Wires joining two sessions' cards, in either direction. */
export function edgesBetweenSessions(
  document: CanvasDocument,
  fromSessionId: string,
  toSessionId: string
): CanvasEdgeId[] {
  const from = sessionNode(document, fromSessionId)?.id
  const to = sessionNode(document, toSessionId)?.id
  if (!from || !to) {
    return []
  }
  return everyEdge(document)
    .filter(
      (edge) =>
        (edge.fromNodeId === from && edge.toNodeId === to) ||
        (edge.fromNodeId === to && edge.toNodeId === from)
    )
    .map((edge) => edge.id)
}

/**
 * The reference's connection.onTransferActive: lights the wires while a message
 * crosses them. Runs `work` and keeps the wires lit until it settles (and at
 * least MIN_LIT_MS), whatever its outcome.
 */
export async function withTransfer<T>(
  edgeIds: readonly CanvasEdgeId[],
  work: () => Promise<T>,
  now: () => number = Date.now
): Promise<T> {
  for (const id of edgeIds) {
    inFlight.set(id, (inFlight.get(id) ?? 0) + 1)
  }
  const started = now()
  try {
    return await work()
  } finally {
    const until = Math.max(now(), started + MIN_LIT_MS)
    for (const id of edgeIds) {
      const left = (inFlight.get(id) ?? 1) - 1
      if (left <= 0) {
        inFlight.delete(id)
      } else {
        inFlight.set(id, left)
      }
      litUntil.set(id, Math.max(litUntil.get(id) ?? 0, until))
    }
  }
}

/** Wires carrying a message right now (or within the lit floor). */
export function activeTransferEdgeIds(now: number = Date.now()): CanvasEdgeId[] {
  for (const [id, until] of litUntil) {
    if (until <= now) {
      litUntil.delete(id)
    }
  }
  return [...new Set([...inFlight.keys(), ...litUntil.keys()])]
}
