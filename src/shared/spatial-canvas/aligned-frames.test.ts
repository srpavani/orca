import { describe, expect, it } from 'vitest'
import { alignedFrames } from './aligned-frames'

const frames = new Map([
  ['a', { x: 3, y: 0, width: 100, height: 50 }],
  ['b', { x: 300, y: 40, width: 60, height: 50 }],
  ['c', { x: 150, y: 90, width: 40, height: 50 }]
])

describe('alignedFrames (reference alignment)', () => {
  it('aligns left edges on the grid', () => {
    const result = alignedFrames(frames, 'left')
    expect([...result.values()].map((frame) => frame.x)).toEqual([0, 0, 0])
  })

  it('aligns right edges to the snapped right bound', () => {
    const result = alignedFrames(frames, 'right')
    expect(result.get('a')?.x).toBe(360 - 100)
    expect(result.get('b')?.x).toBe(360 - 60)
  })

  it('distributes horizontally with an even snapped gap, in x order', () => {
    // span 3..360 = 357, occupied 200 -> gap snap(78.5) = 80; start snap(3) = 0
    const result = alignedFrames(frames, 'distributeHorizontally')
    expect(result.get('a')?.x).toBe(0)
    expect(result.get('c')?.x).toBe(180)
    expect(result.get('b')?.x).toBe(300)
  })

  it('does nothing below the minimum count', () => {
    const two = new Map([...frames].slice(0, 2))
    expect(alignedFrames(two, 'distributeVertically').size).toBe(0)
  })
})
