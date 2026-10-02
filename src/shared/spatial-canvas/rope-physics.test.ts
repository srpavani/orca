import { describe, expect, it } from 'vitest'
import {
  ROPE_SEGMENT_COUNT,
  createRope,
  repinRope,
  ropeEndpoints,
  ropeMidpoint,
  ropePath,
  ropeSag,
  settleRope,
  stepRope
} from './rope-physics'

const A = { x: 0, y: 0 }
const B = { x: 400, y: 0 }

describe('rope endpoints', () => {
  it('leaves the facing sides when the cards are side by side', () => {
    const { start, end } = ropeEndpoints(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 300, y: 0, width: 100, height: 50 }
    )
    expect(start).toEqual({ x: 100, y: 25 })
    expect(end).toEqual({ x: 300, y: 25 })
  })

  it('leaves the facing top/bottom when the cards are stacked', () => {
    const { start, end } = ropeEndpoints(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 300, width: 100, height: 50 }
    )
    expect(start).toEqual({ x: 50, y: 50 })
    expect(end).toEqual({ x: 50, y: 300 })
  })
})

describe('rope physics', () => {
  it('starts with a point per segment, pinned to both ends', () => {
    const rope = createRope(A, B)
    expect(rope.points).toHaveLength(ROPE_SEGMENT_COUNT + 1)
    expect(rope.points[0]).toEqual(A)
    expect(rope.points.at(-1)).toEqual(B)
    expect(rope.restLength).toBeGreaterThan(0)
  })

  it('sags below the straight line between its ends once settled', () => {
    const rope = settleRope(createRope(A, B))
    expect(ropeSag(rope)).toBeGreaterThan(20)
    expect(rope.asleep).toBe(true)
  })

  it('sags less on a short rope than on a long one', () => {
    const short = settleRope(createRope(A, { x: 120, y: 0 }))
    const long = settleRope(createRope(A, { x: 900, y: 0 }))
    expect(ropeSag(short)).toBeLessThan(ropeSag(long))
  })

  it('stops stepping when asleep and wakes when re-pinned far away', () => {
    const rope = settleRope(createRope(A, B))
    expect(stepRope(rope, [])).toBe(false)
    repinRope(rope, A, { x: 400, y: 300 })
    expect(rope.asleep).toBe(false)
    expect(stepRope(rope, [])).toBe(true)
  })

  it('stays roughly inextensible: no segment stretches far past its rest length', () => {
    const rope = settleRope(createRope(A, B))
    for (let index = 0; index < rope.points.length - 1; index += 1) {
      const span = Math.hypot(
        rope.points[index + 1].x - rope.points[index].x,
        rope.points[index + 1].y - rope.points[index].y
      )
      // A Verlet chain reaches its rest pose asymptotically: the last few percent of
      // stretch is what makes the rope read as elastic rather than as a rigid link.
      expect(span).toBeLessThan(rope.restLength * 1.15)
      expect(span).toBeGreaterThan(rope.restLength * 0.85)
    }
  })

  it('drapes over an obstacle instead of crossing it', () => {
    const obstacle = { x: 150, y: -200, width: 100, height: 260 }
    const rope = settleRope(createRope(A, B), [obstacle])
    const inside = rope.points.filter(
      (point) =>
        point.x > obstacle.x &&
        point.x < obstacle.x + obstacle.width &&
        point.y > obstacle.y &&
        point.y < obstacle.y + obstacle.height
    )
    expect(inside).toEqual([])
  })
})

describe('rope path', () => {
  it('draws a cubic curve through every point', () => {
    const rope = settleRope(createRope(A, B))
    const path = ropePath(rope.points)
    expect(path.startsWith('M ')).toBe(true)
    expect(path.match(/C /g)).toHaveLength(ROPE_SEGMENT_COUNT)
  })

  it('returns nothing for a degenerate rope and a midpoint at the middle point', () => {
    expect(ropePath([A])).toBe('')
    const rope = createRope(A, B)
    expect(ropeMidpoint(rope.points)).toEqual(rope.points[ROPE_SEGMENT_COUNT / 2])
  })
})
