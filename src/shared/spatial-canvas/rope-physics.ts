import type { CanvasPoint, CanvasRect } from './types'

/**
 * Wires on the Agent Canvas are ropes, not straight lines: they hang under
 * gravity and swing when a card moves, which is how the eye tells a live
 * connection from a drawn shape. This is a Verlet chain — positions only, with
 * the previous position standing in for velocity — with the numeric constants
 * matched to Maestri's canvas so both products sag the same way.
 *
 * Mutable by design: a rope is stepped every frame for every wire, and
 * reallocating two 21-point arrays per wire per frame is the difference
 * between a smooth canvas and a stuttering one.
 */

export const ROPE_SEGMENT_COUNT = 20
export const ROPE_GRAVITY = 1600
export const ROPE_DAMPING = 0.965
export const ROPE_SLACK_FACTOR = 1.05
export const ROPE_CONSTRAINT_ITERATIONS = 8
export const ROPE_OBSTACLE_PADDING = 20
export const ROPE_OBSTACLE_BLEND = 0.4
export const ROPE_SLEEP_THRESHOLD = 0.5
/**
 * A rope ignores the sleep test until it has been awake this long. Why: the
 * first step of a hanging rope moves it by less than the sleep threshold, so
 * without a grace window every rope would freeze at its dead-straight start.
 */
export const ROPE_GRACE_SECONDS = 0.5
export const ROPE_SETTLE_STEPS = 90
export const ROPE_FIXED_DT = 1 / 60
export const ROPE_MAX_SUBSTEPS = 4
/** A rope is woken when a card moves closer than this, in world units. */
export const ROPE_WAKE_DISTANCE = 80

export type Rope = {
  points: CanvasPoint[]
  previous: CanvasPoint[]
  start: CanvasPoint
  end: CanvasPoint
  restLength: number
  asleep: boolean
  awakeSeconds: number
}

export type RopeObstacle = Pick<CanvasRect, 'x' | 'y' | 'width' | 'height'>

function edgeMidpoints(frame: CanvasRect): CanvasPoint[] {
  const midX = frame.x + frame.width / 2
  const midY = frame.y + frame.height / 2
  return [
    { x: midX, y: frame.y },
    { x: midX, y: frame.y + frame.height },
    { x: frame.x, y: midY },
    { x: frame.x + frame.width, y: midY }
  ]
}

/**
 * Where a rope leaves each card: the reference's closestEdgePins — of the four
 * side midpoints on each card, the pair nearest each other.
 */
export function ropeEndpoints(
  from: CanvasRect,
  to: CanvasRect
): { start: CanvasPoint; end: CanvasPoint } {
  let best = {
    start: { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    end: { x: to.x + to.width / 2, y: to.y + to.height / 2 }
  }
  let bestDistance = Infinity
  for (const start of edgeMidpoints(from)) {
    for (const end of edgeMidpoints(to)) {
      const span = distance(start, end)
      if (span < bestDistance) {
        bestDistance = span
        best = { start, end }
      }
    }
  }
  return best
}

/** The reference's ConnectionsLayer preview: the side midpoint of `frame` nearest `point`. */
export function closestEdgeMidpoint(frame: CanvasRect, point: CanvasPoint): CanvasPoint {
  let best = edgeMidpoints(frame)[0]
  for (const candidate of edgeMidpoints(frame)) {
    if (distance(candidate, point) < distance(best, point)) {
      best = candidate
    }
  }
  return best
}

/**
 * The reference's staticRopePoints: a parabola under the straight line, 12% of
 * the span deep (at least 20). A new wire is born in this shape and then falls
 * and swings into its rest pose — that drop is the connect animation.
 */
export function staticRopePoints(start: CanvasPoint, end: CanvasPoint): CanvasPoint[] {
  const sagAmount = Math.max(distance(start, end) * 0.12, 20)
  const points: CanvasPoint[] = []
  for (let index = 0; index <= ROPE_SEGMENT_COUNT; index += 1) {
    const t = index / ROPE_SEGMENT_COUNT
    points.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t + sagAmount * 4 * t * (1 - t)
    })
  }
  return points
}

/** A rope pinned at both ends; `sagged` starts it in the reference's parabola. */
export function createRope(start: CanvasPoint, end: CanvasPoint, sagged = false): Rope {
  const points: CanvasPoint[] = sagged ? staticRopePoints(start, end) : []
  if (!sagged) {
    for (let index = 0; index <= ROPE_SEGMENT_COUNT; index += 1) {
      const t = index / ROPE_SEGMENT_COUNT
      points.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t })
    }
  }
  return {
    points,
    previous: points.map((point) => ({ ...point })),
    start: { ...start },
    end: { ...end },
    restLength: (distance(start, end) / ROPE_SEGMENT_COUNT) * ROPE_SLACK_FACTOR,
    asleep: false,
    awakeSeconds: 0
  }
}
function distance(left: CanvasPoint, right: CanvasPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y)
}

/** Re-pins a rope to new attachment points, waking it so it swings to the new pose. */
export function repinRope(rope: Rope, start: CanvasPoint, end: CanvasPoint): void {
  const moved =
    distance(rope.start, start) > ROPE_WAKE_DISTANCE / 4 ||
    distance(rope.end, end) > ROPE_WAKE_DISTANCE / 4
  rope.start = { ...start }
  rope.end = { ...end }
  rope.restLength = (distance(start, end) / ROPE_SEGMENT_COUNT) * ROPE_SLACK_FACTOR
  if (moved) {
    rope.asleep = false
    rope.awakeSeconds = 0
  }
}

function integrate(rope: Rope, dt: number): void {
  const { points, previous } = rope
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const last = previous[index]
    const vx = (point.x - last.x) * ROPE_DAMPING
    const vy = (point.y - last.y) * ROPE_DAMPING
    // `previous` keeps the pre-step position: it is the next step's velocity reference
    // AND, after the constraints run, this step's total displacement.
    last.x = point.x
    last.y = point.y
    point.x += vx
    point.y += vy + ROPE_GRAVITY * dt * dt
  }
}

function stepDisplacement(rope: Rope): number {
  let moved = 0
  for (let index = 1; index < rope.points.length - 1; index += 1) {
    moved = Math.max(moved, distance(rope.points[index], rope.previous[index]))
  }
  return moved
}

function satisfyConstraints(rope: Rope): void {
  const { points, restLength } = rope
  for (let pass = 0; pass < ROPE_CONSTRAINT_ITERATIONS; pass += 1) {
    for (let index = 0; index < points.length - 1; index += 1) {
      const left = points[index]
      const right = points[index + 1]
      const dx = right.x - left.x
      const dy = right.y - left.y
      const span = Math.hypot(dx, dy)
      if (span === 0) {
        continue
      }
      const correction = ((span - restLength) / span) * 0.5
      const pushX = dx * correction
      const pushY = dy * correction
      // Endpoints are pinned to the cards; only the interior points move.
      if (index !== 0) {
        left.x += pushX
        left.y += pushY
      }
      if (index + 1 !== points.length - 1) {
        right.x -= pushX
        right.y -= pushY
      }
    }
  }
}

/** Pushes interior points out of a card's padded box so a rope drapes over it, not through it. */
function avoidObstacles(rope: Rope, obstacles: readonly RopeObstacle[]): void {
  if (obstacles.length === 0) {
    return
  }
  const pad = ROPE_OBSTACLE_PADDING
  for (let index = 1; index < rope.points.length - 1; index += 1) {
    const point = rope.points[index]
    for (const box of obstacles) {
      const left = box.x - pad
      const top = box.y - pad
      const right = box.x + box.width + pad
      const bottom = box.y + box.height + pad
      if (point.x <= left || point.x >= right || point.y <= top || point.y >= bottom) {
        continue
      }
      // Shortest way out of the box, damped so a rope slides along an edge instead of snapping.
      const exits: [number, number][] = [
        [left - point.x, 0],
        [right - point.x, 0],
        [0, top - point.y],
        [0, bottom - point.y]
      ]
      let best = exits[0]
      for (const exit of exits) {
        if (Math.hypot(exit[0], exit[1]) < Math.hypot(best[0], best[1])) {
          best = exit
        }
      }
      point.x += best[0] * ROPE_OBSTACLE_BLEND
      point.y += best[1] * ROPE_OBSTACLE_BLEND
    }
  }
}

/** One fixed step. Returns false once the rope has settled and can be skipped. */
export function stepRope(
  rope: Rope,
  obstacles: readonly RopeObstacle[],
  dt = ROPE_FIXED_DT
): boolean {
  if (rope.asleep) {
    return false
  }
  integrate(rope, dt)
  satisfyConstraints(rope)
  avoidObstacles(rope, obstacles)
  rope.points[0] = rope.start
  rope.points[rope.points.length - 1] = rope.end
  rope.awakeSeconds += dt
  if (rope.awakeSeconds >= ROPE_GRACE_SECONDS && stepDisplacement(rope) < ROPE_SLEEP_THRESHOLD) {
    rope.asleep = true
    return false
  }
  return true
}

/** Runs a fresh rope to its resting pose so it is already hanging on first paint. */
export function settleRope(rope: Rope, obstacles: readonly RopeObstacle[] = []): Rope {
  rope.asleep = false
  for (let step = 0; step < ROPE_SETTLE_STEPS; step += 1) {
    integrate(rope, ROPE_FIXED_DT)
    satisfyConstraints(rope)
    avoidObstacles(rope, obstacles)
    rope.points[0] = rope.start
    rope.points[rope.points.length - 1] = rope.end
  }
  rope.asleep = true
  rope.awakeSeconds = 0
  return rope
}

function toPathPoint(point: CanvasPoint): string {
  return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`
}

/**
 * Smooth path through the rope's points. A raw polyline shows its 20 joints as
 * facets at any zoom; the Catmull-Rom control points below round them off.
 */
export function ropePath(points: readonly CanvasPoint[]): string {
  if (points.length < 2) {
    return ''
  }
  let path = `M ${toPathPoint(points[0])}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index - 1] ?? points[index]
    const from = points[index]
    const to = points[index + 1]
    const after = points[index + 2] ?? to
    const c1 = { x: from.x + (to.x - before.x) / 6, y: from.y + (to.y - before.y) / 6 }
    const c2 = { x: to.x - (after.x - from.x) / 6, y: to.y - (after.y - from.y) / 6 }
    path += ` C ${toPathPoint(c1)}, ${toPathPoint(c2)}, ${toPathPoint(to)}`
  }
  return path
}

/** Middle point of the rope, where its cut affordance sits. */
export function ropeMidpoint(points: readonly CanvasPoint[]): CanvasPoint {
  const middle = points[Math.floor(points.length / 2)] ?? points[0]
  return { ...middle }
}

/** Resting sag of a rope, measured downward from the straight line between its ends. */
export function ropeSag(rope: Rope): number {
  const middle = rope.points[Math.floor(rope.points.length / 2)]
  const straight = { x: (rope.start.x + rope.end.x) / 2, y: (rope.start.y + rope.end.y) / 2 }
  return middle.y - straight.y
}
