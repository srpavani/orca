import { describe, expect, it } from 'vitest'
import {
  CANVAS_BACKGROUND_STYLES,
  CANVAS_CONNECTION_STYLES,
  CANVAS_SELECTION_STYLES,
  CIRCUIT_CORNER_RADIUS,
  canvasSurfaceStyle,
  circuitPath,
  defaultCanvasAppearance,
  parseCanvasAppearance,
  ropeAvoidsNodes,
  selectionPaint
} from './canvas-appearance'

const viewport = { origin: { x: 100, y: 50 }, zoom: 2 }

describe('parseCanvasAppearance', () => {
  it('falls back to the reference defaults', () => {
    expect(defaultCanvasAppearance()).toEqual({
      background: 'grid',
      connectionStyle: 'avoidNodes',
      selectionStyle: 'elevation'
    })
  })

  it('keeps valid stored values', () => {
    expect(
      parseCanvasAppearance({
        background: 'transparent',
        connectionStyle: 'circuit',
        selectionStyle: 'corners'
      })
    ).toEqual({ background: 'transparent', connectionStyle: 'circuit', selectionStyle: 'corners' })
  })

  it('falls back per field, so one bad value cannot lose the others', () => {
    expect(parseCanvasAppearance({ background: 'nope', connectionStyle: 'behindNodes' })).toEqual({
      background: 'grid',
      connectionStyle: 'behindNodes',
      selectionStyle: 'elevation'
    })
  })

  it.each([null, undefined, 'grid', 7, []])('ignores %j', (value) => {
    expect(parseCanvasAppearance(value)).toEqual(defaultCanvasAppearance())
  })

  it('covers every option the reference offers', () => {
    expect(CANVAS_BACKGROUND_STYLES).toEqual(['grid', 'plain', 'transparent'])
    expect(CANVAS_CONNECTION_STYLES).toEqual(['avoidNodes', 'behindNodes', 'circuit'])
    expect(CANVAS_SELECTION_STYLES).toEqual([
      'dashedBorder',
      'solidBorder',
      'corners',
      'cornerDots',
      'elevation'
    ])
  })
})

describe('canvasSurfaceStyle', () => {
  it('rules the grid when the background is grid', () => {
    const style = canvasSurfaceStyle(defaultCanvasAppearance(), viewport, 2)
    expect(style.backgroundColor).toBe('var(--color-canvas-surface)')
    expect(style.backgroundImage).toContain('to right')
    expect(style.backgroundSize).toBe('40px 40px')
    expect(style.backgroundPosition).toBe('-200px -100px')
  })

  it('keeps the fill but drops the ruling when plain', () => {
    const style = canvasSurfaceStyle(
      { ...defaultCanvasAppearance(), background: 'plain' },
      viewport
    )
    expect(style.backgroundColor).toBe('var(--color-canvas-surface)')
    expect(style.backgroundImage).toBeUndefined()
  })

  it('drops the fill too when transparent', () => {
    const style = canvasSurfaceStyle(
      { ...defaultCanvasAppearance(), background: 'transparent' },
      viewport
    )
    expect(style.backgroundColor).toBeUndefined()
    expect(style.backgroundImage).toBeUndefined()
  })
})

describe('connection styles', () => {
  it('only drapes wires around cards when asked to', () => {
    expect(ropeAvoidsNodes({ ...defaultCanvasAppearance(), connectionStyle: 'avoidNodes' })).toBe(
      true
    )
    expect(ropeAvoidsNodes({ ...defaultCanvasAppearance(), connectionStyle: 'behindNodes' })).toBe(
      false
    )
    expect(ropeAvoidsNodes({ ...defaultCanvasAppearance(), connectionStyle: 'circuit' })).toBe(
      false
    )
  })

  it('routes a circuit orthogonally when the run is wider than tall', () => {
    const path = circuitPath([
      { x: 0, y: 0 },
      { x: 200, y: 0 }
    ])
    // Turns at the midpoint, and never moves diagonally.
    expect(path).toContain('M 0.00 0.00')
    expect(path).toContain('100.00')
    expect(path.endsWith('L 200.00 0.00')).toBe(true)
    expect(path).toContain('Q')
  })

  it('turns on the vertical midpoint when the run is taller than wide', () => {
    const path = circuitPath([
      { x: 0, y: 0 },
      { x: 10, y: 200 }
    ])
    expect(path).toContain('100.00')
    expect(path.endsWith('L 10.00 200.00')).toBe(true)
  })

  it('needs two points to draw anything', () => {
    expect(circuitPath([])).toBe('')
    expect(circuitPath([{ x: 1, y: 1 }])).toBe('')
  })
})

describe('selection styles', () => {
  it('paints each of the reference options differently', () => {
    expect(selectionPaint('dashedBorder')).toEqual({
      boxShadow: 'default',
      border: 'dashed',
      marks: 'none'
    })
    expect(selectionPaint('solidBorder').border).toBe('solid')
    expect(selectionPaint('corners').marks).toBe('brackets')
    expect(selectionPaint('cornerDots').marks).toBe('dots')
    expect(selectionPaint('elevation').boxShadow).toBe('elevated')
  })

  it('keeps the elevation default the port already drew', () => {
    expect(selectionPaint('elevation')).toEqual({
      boxShadow: 'elevated',
      border: 'none',
      marks: 'none'
    })
    expect(CIRCUIT_CORNER_RADIUS).toBe(8)
  })
})
