import { findNode } from './levels'
import type { CanvasDocument, CanvasEdgeKind, CanvasNodeId } from './types'

/** Edge kind is derived from the two endpoints; callers never pick it by hand. */
export function inferEdgeKind(
  document: CanvasDocument,
  fromNodeId: CanvasNodeId,
  toNodeId: CanvasNodeId
): CanvasEdgeKind | null {
  const from = findNode(document, fromNodeId)?.content.kind
  const to = findNode(document, toNodeId)?.content.kind
  if (!from || !to) {
    return null
  }
  const pair = new Set([from, to])
  if (pair.size === 1 && from === 'session') {
    return 'session-session'
  }
  if (pair.has('session') && pair.has('note')) {
    return 'session-note'
  }
  if (from === 'note' && to === 'note') {
    return 'note-note'
  }
  if (pair.has('session') && pair.has('portal')) {
    return 'session-portal'
  }
  if (from === 'portal' && to === 'portal') {
    return 'portal-portal'
  }
  if (pair.has('session') && pair.has('drawing')) {
    return 'session-drawing'
  }
  return null
}
