import type { CanvasPoint, CanvasRect } from '../../../../shared/spatial-canvas/types'

export type RopeGeometry = {
  /** SVG path data for a cubic Bézier, in the same space as the input rects. */
  d: string
  /** Curve midpoint, where the wire's delete affordance sits. */
  mid: CanvasPoint
}

const MIN_BEND = 48

function centerOf(rect: CanvasRect): CanvasPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function cubic(p0: CanvasPoint, p1: CanvasPoint, p2: CanvasPoint, p3: CanvasPoint): RopeGeometry {
  return {
    d: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`,
    // Bézier at t = 0.5 is (p0 + 3·p1 + 3·p2 + p3) / 8.
    mid: {
      x: (p0.x + 3 * p1.x + 3 * p2.x + p3.x) / 8,
      y: (p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8
    }
  }
}

/**
 * Joins two frames on the sides that face each other, bending along the
 * dominant axis so ropes read as flowing between cards rather than through them.
 */
export function ropeBetween(from: CanvasRect, to: CanvasRect): RopeGeometry {
  const a = centerOf(from)
  const b = centerOf(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const direction = dx >= 0 ? 1 : -1
    const start = { x: a.x + (direction * from.width) / 2, y: a.y }
    const end = { x: b.x - (direction * to.width) / 2, y: b.y }
    const bend = Math.max(MIN_BEND, Math.abs(end.x - start.x) / 2) * direction
    return cubic(start, { x: start.x + bend, y: start.y }, { x: end.x - bend, y: end.y }, end)
  }
  const direction = dy >= 0 ? 1 : -1
  const start = { x: a.x, y: a.y + (direction * from.height) / 2 }
  const end = { x: b.x, y: b.y - (direction * to.height) / 2 }
  const bend = Math.max(MIN_BEND, Math.abs(end.y - start.y) / 2) * direction
  return cubic(start, { x: start.x, y: start.y + bend }, { x: end.x, y: end.y - bend }, end)
}

/** Rope from a frame to a free point (the cursor while a wire is being drawn). */
export function ropeToPoint(from: CanvasRect, point: CanvasPoint): RopeGeometry {
  return ropeBetween(from, { x: point.x, y: point.y, width: 0, height: 0 })
}
