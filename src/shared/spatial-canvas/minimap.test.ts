import { describe, expect, it } from 'vitest'
import { minimapPoint, originForMinimapPoint, projectMinimap } from './minimap'

const viewport = { zoom: 1, origin: { x: 0, y: 0 } }
const stage = { width: 800, height: 600 }

describe('projectMinimap', () => {
  it('frames only the visible area on an empty board', () => {
    const projection = projectMinimap([], viewport, stage)
    expect(projection.bounds).toEqual({ x: 0, y: 0, width: 800, height: 600 })
    // (200 - 32) / 800 = 0.21, (150 - 32) / 600 = 0.1967 -> the tighter one
    expect(projection.scale).toBeCloseTo(118 / 600)
  })

  it('pads the cards by 200 and unites them with the view', () => {
    const projection = projectMinimap([{ x: 1000, y: 0, width: 100, height: 100 }], viewport, stage)
    expect(projection.bounds).toEqual({ x: 0, y: -200, width: 1300, height: 800 })
  })

  it('centres the stage on the picked point', () => {
    const projection = projectMinimap([], viewport, stage)
    const mini = minimapPoint(projection, { x: 400, y: 300 })
    expect(originForMinimapPoint(projection, mini, viewport, stage)).toEqual({ x: 0, y: 0 })
  })
})
