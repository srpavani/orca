import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ZOOM,
  GROUND_ORIGIN,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_LEVELS,
  centerOnRect,
  clampZoom,
  contentBounds,
  contentOutsideStage,
  createViewport,
  fitCanvasViewport,
  nextZoomLevel,
  panBy,
  screenToWorld,
  worldRectToScreen,
  worldToScreen,
  zoomAtPoint
} from './geometry'
import type { CanvasViewport } from './types'

const viewportAt = (zoom: number, x = 0, y = 0): CanvasViewport => ({ origin: { x, y }, zoom })

describe('createViewport', () => {
  it('starts at the ground origin so world coordinates can grow in every direction', () => {
    const viewport = createViewport()
    expect(viewport.zoom).toBe(DEFAULT_ZOOM)
    expect(viewport.origin).toEqual(GROUND_ORIGIN)
  })

  it('returns a copy of the origin rather than the shared constant', () => {
    const viewport = createViewport()
    viewport.origin.x = 1
    expect(GROUND_ORIGIN.x).toBe(9500)
  })
})

describe('screenToWorld / worldToScreen', () => {
  it('round-trips a point at zoom 1', () => {
    const viewport = viewportAt(1, 100, 50)
    const world = screenToWorld({ x: 30, y: 70 }, viewport)
    expect(world).toEqual({ x: 130, y: 120 })
    expect(worldToScreen(world, viewport)).toEqual({ x: 30, y: 70 })
  })

  it('scales with zoom', () => {
    const viewport = viewportAt(2, 0, 0)
    expect(screenToWorld({ x: 100, y: 100 }, viewport)).toEqual({ x: 50, y: 50 })
    expect(worldToScreen({ x: 50, y: 50 }, viewport)).toEqual({ x: 100, y: 100 })
  })

  it('round-trips at a fractional zoom', () => {
    const viewport = viewportAt(0.33, 9500, 9500)
    const point = { x: 412.5, y: -88 }
    const back = worldToScreen(screenToWorld(point, viewport), viewport)
    expect(back.x).toBeCloseTo(point.x)
    expect(back.y).toBeCloseTo(point.y)
  })
})

describe('worldRectToScreen', () => {
  it('scales position and size together', () => {
    const viewport = viewportAt(0.5, 10, 20)
    expect(worldRectToScreen({ x: 30, y: 60, width: 100, height: 40 }, viewport)).toEqual({
      x: 10,
      y: 20,
      width: 50,
      height: 20
    })
  })
})

describe('clampZoom', () => {
  it('floors at MIN_ZOOM and caps at MAX_ZOOM', () => {
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM)
    expect(clampZoom(99)).toBe(MAX_ZOOM)
    expect(clampZoom(1.25)).toBe(1.25)
  })
})

describe('nextZoomLevel', () => {
  it('steps to the next discrete level upward', () => {
    expect(nextZoomLevel(1, 1, null)).toBe(1.1)
    expect(nextZoomLevel(0.1, 1, null)).toBe(0.15)
  })

  it('steps to the previous discrete level downward', () => {
    expect(nextZoomLevel(1, -1, null)).toBe(0.9)
    expect(nextZoomLevel(3, -1, null)).toBe(2.5)
  })

  it('saturates at the ends', () => {
    expect(nextZoomLevel(MAX_ZOOM, 1, null)).toBe(MAX_ZOOM)
    expect(nextZoomLevel(MIN_ZOOM, -1, null)).toBe(MIN_ZOOM)
  })

  it('ignores a zoom value that is a hair below a level', () => {
    expect(nextZoomLevel(0.999, 1, null)).toBe(1.1)
  })

  it('uses a proportional step for trackpad pinch', () => {
    expect(nextZoomLevel(1, 1, 10)).toBe(1.1)
    expect(nextZoomLevel(1, -1, 10)).toBe(0.909)
  })

  it('clamps a proportional step to the zoom range', () => {
    expect(nextZoomLevel(MAX_ZOOM, 1, 100)).toBe(MAX_ZOOM)
  })

  it('treats a ten percent step as the exact level it lands on', () => {
    expect(nextZoomLevel(1, 1, 10)).toBe(ZOOM_LEVELS[9])
  })
})

describe('zoomAtPoint', () => {
  it('keeps the world point under the cursor stationary', () => {
    const viewport = viewportAt(1, 100, 100)
    const anchor = { x: 250, y: 400 }
    const before = screenToWorld(anchor, viewport)
    const zoomed = zoomAtPoint(viewport, 2, anchor)
    expect(zoomed.zoom).toBe(2)
    const after = screenToWorld(anchor, zoomed)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps the requested zoom', () => {
    expect(zoomAtPoint(viewportAt(1), 1000, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM)
    expect(zoomAtPoint(viewportAt(1), 0, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM)
  })

  it('is a no-op when the zoom does not change', () => {
    const viewport = viewportAt(1.5, 12, 34)
    const zoomed = zoomAtPoint(viewport, 1.5, { x: 200, y: 300 })
    expect(zoomed.origin.x).toBeCloseTo(viewport.origin.x)
    expect(zoomed.origin.y).toBeCloseTo(viewport.origin.y)
  })
})

describe('panBy', () => {
  it('moves the world opposite to the drag so content follows the pointer', () => {
    const viewport = viewportAt(2, 100, 100)
    expect(panBy(viewport, { x: 40, y: -20 })).toEqual({ zoom: 2, origin: { x: 80, y: 110 } })
  })

  it('does not change zoom', () => {
    expect(panBy(viewportAt(0.5), { x: 10, y: 10 }).zoom).toBe(0.5)
  })
})

describe('centerOnRect', () => {
  it('places the rect centre at the middle of the viewport', () => {
    const viewport = centerOnRect(
      { x: 1000, y: 2000, width: 400, height: 200 },
      { width: 800, height: 600 },
      1
    )
    const centre = worldToScreen({ x: 1200, y: 2100 }, viewport)
    expect(centre.x).toBeCloseTo(400)
    expect(centre.y).toBeCloseTo(300)
  })

  it('clamps the zoom it is handed', () => {
    const viewport = centerOnRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 100, height: 100 },
      99
    )
    expect(viewport.zoom).toBe(MAX_ZOOM)
  })
})

describe('contentBounds', () => {
  it('wraps every rect', () => {
    const bounds = contentBounds([
      { x: 10, y: 20, width: 30, height: 40 },
      { x: -5, y: 60, width: 10, height: 10 }
    ])
    expect(bounds).toEqual({ x: -5, y: 20, width: 45, height: 50 })
  })

  it('has nothing to wrap for an empty board', () => {
    expect(contentBounds([])).toBeNull()
  })
})

describe('fitCanvasViewport', () => {
  const stage = { width: 1000, height: 500 }

  it('centres the cards and picks the largest level that fits', () => {
    // 800x400 in a 1000x500 stage leaves 840x340 of room once padding is taken
    // off, so the largest level that fits is 0.75 rather than 1.
    const viewport = fitCanvasViewport([{ x: 9000, y: 9000, width: 800, height: 400 }], stage)
    expect(viewport).not.toBeNull()
    expect(viewport?.zoom).toBe(0.75)
    // The card's centre lands at the stage's centre.
    const centre = worldToScreen({ x: 9000 + 400, y: 9000 + 200 }, viewport ?? viewportAt(1))
    expect(centre.x).toBeCloseTo(500)
    expect(centre.y).toBeCloseTo(250)
  })

  it('steps down when the board is larger than the window', () => {
    const viewport = fitCanvasViewport([{ x: 0, y: 0, width: 4000, height: 2000 }], stage)
    expect(viewport?.zoom).toBe(0.15)
    expect(viewport?.zoom).toBeLessThan(DEFAULT_ZOOM)
  })

  it('never magnifies past a hundred percent', () => {
    const viewport = fitCanvasViewport([{ x: 0, y: 0, width: 20, height: 20 }], stage)
    expect(viewport?.zoom).toBe(DEFAULT_ZOOM)
  })

  it('has no viewport for an empty board or an unmeasured stage', () => {
    expect(fitCanvasViewport([], stage)).toBeNull()
    expect(
      fitCanvasViewport([{ x: 0, y: 0, width: 10, height: 10 }], { width: 0, height: 0 })
    ).toBeNull()
  })
})

describe('contentOutsideStage', () => {
  const stage = { width: 1000, height: 500 }

  it('is false while any card is on screen', () => {
    const viewport = viewportAt(1, 9000, 9000)
    expect(
      contentOutsideStage(viewport, stage, [
        { x: 9050, y: 9050, width: 200, height: 100 },
        { x: 9000 + 5000, y: 9000, width: 100, height: 100 }
      ])
    ).toBe(false)
  })

  it('is true when the saved viewport points away from every card', () => {
    const viewport = viewportAt(1, -540, 4079)
    expect(
      contentOutsideStage(viewport, stage, [{ x: 9580, y: 9580, width: 640, height: 400 }])
    ).toBe(true)
  })

  it('is false for an empty board, which is not a broken view', () => {
    expect(contentOutsideStage(viewportAt(1, -540, 4079), stage, [])).toBe(false)
  })
})
