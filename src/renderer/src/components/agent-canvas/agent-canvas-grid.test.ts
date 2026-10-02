import { describe, expect, it } from 'vitest'
import { CANVAS_GRID_CELL, canvasGridStyle } from './agent-canvas-grid'

const viewport = { origin: { x: 100, y: 50 }, zoom: 2 }

describe('canvasGridStyle', () => {
  it('paints ruled squares scaled by zoom and offset by the pan', () => {
    const style = canvasGridStyle(viewport, 2)
    expect(style.backgroundSize).toBe(`${CANVAS_GRID_CELL * 2}px ${CANVAS_GRID_CELL * 2}px`)
    expect(style.backgroundPosition).toBe('-200px -100px')
    expect(style.backgroundImage).toContain('to right')
    expect(style.backgroundImage).toContain('to bottom')
  })

  it('uses half-pixel lines on a dense display and a full pixel otherwise', () => {
    // Why: at dpr >= 1.5 a 1px line covers more than a device pixel and the grid turns muddy.
    expect(canvasGridStyle(viewport, 1).backgroundImage).toContain('1px, transparent 1px')
    expect(canvasGridStyle(viewport, 1).backgroundImage).toContain('50%')
    expect(canvasGridStyle(viewport, 2).backgroundImage).toContain('0.5px, transparent 0.5px')
  })
})
