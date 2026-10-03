/**
 * Rectangle selection and group drag, as the reference does them
 * (MarqueeSelection): the rectangle picks every card it touches on the floor
 * in view — never cards on other floors — and dragging a selected card carries
 * the whole selection with it.
 */

import type { CanvasLevelContents, CanvasNodeId, CanvasPoint, CanvasRect } from './types'

/** A press that moves less than this (screen px) is a click, not a rectangle. */
export const MARQUEE_MIN_PX = 4

export function rectBetween(start: CanvasPoint, end: CanvasPoint): CanvasRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

export function rectsIntersect(a: CanvasRect, b: CanvasRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/**
 * The cards a world-space rectangle touches on one floor, in draw order.
 * Locked cards are skipped (they are pinned in place) and so are bridge
 * markers, which are not cards.
 */
export function marqueeHits(floor: CanvasLevelContents, rect: CanvasRect): CanvasNodeId[] {
  return floor.nodes
    .filter(
      (node) =>
        node.locked !== true && node.content.kind !== 'bridge' && rectsIntersect(rect, node.frame)
    )
    .toSorted((left, right) => left.zIndex - right.zIndex)
    .map((node) => node.id)
}

/** Shift adds to what was selected; a plain rectangle replaces it. Order is kept, no repeats. */
export function combineSelection(
  previous: readonly CanvasNodeId[],
  hits: readonly CanvasNodeId[],
  additive: boolean
): CanvasNodeId[] {
  return additive ? [...new Set([...previous, ...hits])] : [...hits]
}

/**
 * What a header drag moves: the whole selection when the grabbed card is part
 * of it, otherwise just that card. Locked cards stay where they are.
 */
export function dragSet(
  floor: CanvasLevelContents,
  grabbed: CanvasNodeId,
  selected: readonly CanvasNodeId[]
): Map<CanvasNodeId, CanvasPoint> {
  const ids = selected.includes(grabbed) ? selected : [grabbed]
  const origins = new Map<CanvasNodeId, CanvasPoint>()
  for (const node of floor.nodes) {
    if (ids.includes(node.id) && node.locked !== true) {
      origins.set(node.id, { x: node.frame.x, y: node.frame.y })
    }
  }
  return origins
}

/** Each dragged card's new position, by the same world-space delta. */
export function draggedPositions(
  origins: ReadonlyMap<CanvasNodeId, CanvasPoint>,
  delta: CanvasPoint
): Map<CanvasNodeId, CanvasPoint> {
  const moved = new Map<CanvasNodeId, CanvasPoint>()
  for (const [id, origin] of origins) {
    moved.set(id, { x: origin.x + delta.x, y: origin.y + delta.y })
  }
  return moved
}
