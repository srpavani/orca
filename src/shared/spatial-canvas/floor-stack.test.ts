import { describe, expect, it } from 'vitest'
import {
  FLOOR_GRID_CELL_PX,
  FLOOR_LIVE_OFFSET_Y,
  FLOOR_OPACITY_ABOVE,
  FLOOR_OPACITY_BELOW,
  FLOOR_PERSPECTIVE_FALLBACK_PX,
  FLOOR_SPACING,
  buildFloorStack,
  clampToUnit,
  floorGhostOpacity,
  floorPerspectivePx,
  floorYOffset,
  floorsAbove,
  floorsBelow
} from './floor-stack'

describe('floor stack geometry', () => {
  it('clamps to the unit range', () => {
    expect(clampToUnit(3)).toBe(1)
    expect(clampToUnit(-3)).toBe(-1)
    expect(clampToUnit(0.25)).toBe(0.25)
  })

  it('places the live floor at the live offset and stacks the rest by spacing', () => {
    expect(floorYOffset(0)).toBe(FLOOR_LIVE_OFFSET_Y)
    // One floor down: one spacing lower, plus the fan-out gap.
    expect(floorYOffset(-1)).toBe(FLOOR_SPACING + FLOOR_LIVE_OFFSET_Y + 30)
    expect(floorYOffset(-2)).toBe(2 * FLOOR_SPACING + FLOOR_LIVE_OFFSET_Y + 30)
  })

  it('tapers the fan-out gap as the stack goes up', () => {
    expect(floorYOffset(1)).toBe(-FLOOR_SPACING + FLOOR_LIVE_OFFSET_Y - 30)
    expect(floorYOffset(2)).toBe(-2 * FLOOR_SPACING + FLOOR_LIVE_OFFSET_Y - 30)
  })

  it('draws a ghost only on the layer that owns its side', () => {
    expect(floorGhostOpacity(0, 'below')).toBe(0)
    expect(floorGhostOpacity(0, 'above')).toBe(0)
    expect(floorGhostOpacity(-1, 'below')).toBe(FLOOR_OPACITY_BELOW)
    expect(floorGhostOpacity(-1, 'above')).toBe(0)
    expect(floorGhostOpacity(1, 'above')).toBe(FLOOR_OPACITY_ABOVE)
    expect(floorGhostOpacity(1, 'below')).toBe(0)
  })

  it('scales perspective with the stage and falls back when unmeasured', () => {
    expect(floorPerspectivePx(1000)).toBe(2000)
    expect(floorPerspectivePx(0)).toBe(FLOOR_PERSPECTIVE_FALLBACK_PX)
    expect(floorPerspectivePx(Number.NaN)).toBe(FLOOR_PERSPECTIVE_FALLBACK_PX)
  })
})

describe('buildFloorStack', () => {
  const floors = [
    { id: null, name: 'Ground', items: 2 },
    { id: 'f1', name: 'Experiment', items: 1 },
    { id: 'f2', name: 'Refactor', items: 0 }
  ]

  it('numbers floors relative to the live one and keeps the ground at the bottom', () => {
    const stack = buildFloorStack(floors, 'f1')
    expect(stack.map((item) => [item.key, item.relativePosition])).toEqual([
      ['ground', -1],
      ['f1', 0],
      ['f2', 1]
    ])
    expect(stack[0].detail).toBe('2 items')
    expect(stack[1].detail).toBe('1 item')
  })

  it('treats the ground floor as live when nothing is selected', () => {
    expect(buildFloorStack(floors, null).map((item) => item.relativePosition)).toEqual([0, 1, 2])
  })

  it('splits the stack into the layers that draw it', () => {
    const stack = buildFloorStack(floors, 'f1')
    expect(floorsBelow(stack).map((item) => item.key)).toEqual(['ground'])
    expect(floorsAbove(stack).map((item) => item.key)).toEqual(['f2'])
  })

  it('uses the same grid cell as the canvas', () => {
    expect(FLOOR_GRID_CELL_PX).toBe(20)
  })
})
