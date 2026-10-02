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

/** Bounding box around every rect, or null when there is nothing to frame. */
export function contentBounds(rects: readonly CanvasRect[]): CanvasRect | null {
  if (rects.length === 0) {
    return null
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * The largest discrete zoom at which `bounds` still fits the stage. Capped at
 * 100%: fitting is for board state that is out of sight, and magnifying a lone
 * card to 300% is not a view anyone asked for.
 */
function fitZoom(bounds: CanvasRect, available: { width: number; height: number }): number {
  const limit = Math.min(
    available.width / Math.max(bounds.width, 1),
    available.height / Math.max(bounds.height, 1)
  )
  let zoom: number = MIN_ZOOM
  for (const level of ZOOM_LEVELS) {
    if (level <= limit && level <= DEFAULT_ZOOM) {
      zoom = level
    }
  }
  return zoom
}

/**
 * A viewport that frames every rect, or null when there is nothing to frame.
 * This is what makes the board self-healing: a viewport saved against a different
 * layout (or a card placed outside it) would otherwise leave the canvas looking
 * empty while the document is full.
 */
export function fitCanvasViewport(
  rects: readonly CanvasRect[],
  stage: { width: number; height: number },
  padding = 80
): CanvasViewport | null {
  const bounds = contentBounds(rects)
  if (bounds === null || stage.width <= 0 || stage.height <= 0) {
    return null
  }
  const available = {
    width: Math.max(stage.width - padding * 2, 1),
    height: Math.max(stage.height - padding * 2, 1)
  }
  return centerOnRect(bounds, stage, fitZoom(bounds, available))
}

/** True when every rect falls outside the stage, so the board only looks empty. */
export function contentOutsideStage(
  viewport: CanvasViewport,
  stage: { width: number; height: number },
  rects: readonly CanvasRect[]
): boolean {
  if (rects.length === 0) {
    return false
  }
  return rects.every((rect) => {
    const screen = worldRectToScreen(rect, viewport)
    return (
      screen.x + screen.width < 0 ||
      screen.y + screen.height < 0 ||
      screen.x > stage.width ||
      screen.y > stage.height
    )
  })
}
