import type { CanvasPoint, CanvasRect, CanvasViewport } from './types'

/**
 * Discrete zoom steps. Anchoring the viewport at a fixed origin (see
 * GROUND_ORIGIN) means world coordinates stay positive in every direction the
 * canvas can grow.
 */
export const ZOOM_LEVELS = [
  0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3
] as const

export const DEFAULT_ZOOM = 1
export const MIN_ZOOM = ZOOM_LEVELS[0]
export const MAX_ZOOM = ZOOM_LEVELS.at(-1) ?? 3
export const GROUND_ORIGIN: CanvasPoint = { x: 9500, y: 9500 }

/** Zoom is floored at MIN_ZOOM and capped at MAX_ZOOM. */
export function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM)
}

export function createViewport(): CanvasViewport {
  return { origin: { ...GROUND_ORIGIN }, zoom: DEFAULT_ZOOM }
}

export function screenToWorld(point: CanvasPoint, viewport: CanvasViewport): CanvasPoint {
  return {
    x: viewport.origin.x + point.x / viewport.zoom,
    y: viewport.origin.y + point.y / viewport.zoom
  }
}

export function worldToScreen(point: CanvasPoint, viewport: CanvasViewport): CanvasPoint {
  return {
    x: (point.x - viewport.origin.x) * viewport.zoom,
    y: (point.y - viewport.origin.y) * viewport.zoom
  }
}

export function worldRectToScreen(rect: CanvasRect, viewport: CanvasViewport): CanvasRect {
  return {
    x: (rect.x - viewport.origin.x) * viewport.zoom,
    y: (rect.y - viewport.origin.y) * viewport.zoom,
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom
  }
}

export function panBy(viewport: CanvasViewport, deltaScreen: CanvasPoint): CanvasViewport {
  return {
    zoom: viewport.zoom,
    origin: {
      x: viewport.origin.x - deltaScreen.x / viewport.zoom,
      y: viewport.origin.y - deltaScreen.y / viewport.zoom
    }
  }
}

/**
 * Picks the next discrete level. `stepPercent` switches to a proportional step
 * for trackpad pinch, where snapping to a level would feel like stuttering.
 */
export function nextZoomLevel(zoom: number, direction: 1 | -1, stepPercent: number | null): number {
  if (stepPercent !== null) {
    const factor = 1 + stepPercent / 100
    const next = direction === 1 ? zoom * factor : zoom / factor
    return clampZoom(Math.round(next * 1000) / 1000)
  }
  const epsilon = 0.001
  if (direction === 1) {
    for (const level of ZOOM_LEVELS) {
      if (level > zoom + epsilon) {
        return level
      }
    }
    return MAX_ZOOM
  }
  for (let index = ZOOM_LEVELS.length - 1; index >= 0; index -= 1) {
    const level = ZOOM_LEVELS[index]
    if (level !== undefined && level < zoom - epsilon) {
      return level
    }
  }
  return MIN_ZOOM
}

/**
 * Zooms while keeping the world point under `screenAnchor` stationary, so the
 * canvas grows out of the cursor rather than the top-left corner.
 */
export function zoomAtPoint(
  viewport: CanvasViewport,
  nextZoom: number,
  screenAnchor: CanvasPoint
): CanvasViewport {
  const zoom = clampZoom(nextZoom)
  const anchor = screenToWorld(screenAnchor, viewport)
  return {
    zoom,
    origin: { x: anchor.x - screenAnchor.x / zoom, y: anchor.y - screenAnchor.y / zoom }
  }
}

/** Centres `rect` in a viewport of `viewportSize` screen pixels. */
export function centerOnRect(
  rect: CanvasRect,
  viewportSize: { width: number; height: number },
  zoom: number
): CanvasViewport {
  const safeZoom = clampZoom(zoom)
  return {
    zoom: safeZoom,
    origin: {
      x: rect.x + rect.width / 2 - viewportSize.width / 2 / safeZoom,
      y: rect.y + rect.height / 2 - viewportSize.height / 2 / safeZoom
    }
  }
}
