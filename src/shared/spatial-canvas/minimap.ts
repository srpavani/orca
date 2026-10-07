import type { CanvasPoint, CanvasRect, CanvasViewport } from './types'

/** The reference's minimap metrics (MinimapPanel). */
export const MINIMAP = {
  width: 200,
  height: 150,
  padding: 16,
  boundsPad: 200,
  minNodeDot: 2,
  keyNudge: 0.2
} as const

export type MinimapProjection = {
  bounds: CanvasRect
  scale: number
  /** The visible part of the board, in world units. */
  visible: CanvasRect
}

function union(a: CanvasRect, b: CanvasRect): CanvasRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y
  }
}

/**
 * The reference's minimap framing: every card padded by 200 world units,
 * united with what is on screen, scaled to fit the 200×150 panel minus its
 * 16px padding.
 */
export function projectMinimap(
  frames: readonly CanvasRect[],
  viewport: CanvasViewport,
  stage: { width: number; height: number }
): MinimapProjection {
  const zoom = Math.max(viewport.zoom, 0.0001)
  const visible = {
    x: viewport.origin.x,
    y: viewport.origin.y,
    width: stage.width / zoom,
    height: stage.height / zoom
  }
  let bounds = visible
  if (frames.length > 0) {
    const minX = Math.min(...frames.map((frame) => frame.x))
    const minY = Math.min(...frames.map((frame) => frame.y))
    const maxX = Math.max(...frames.map((frame) => frame.x + frame.width))
    const maxY = Math.max(...frames.map((frame) => frame.y + frame.height))
    const pad = MINIMAP.boundsPad
    bounds = union(
      { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 },
      visible
    )
  }
  const scale = Math.min(
    (MINIMAP.width - MINIMAP.padding * 2) / Math.max(bounds.width, 1),
    (MINIMAP.height - MINIMAP.padding * 2) / Math.max(bounds.height, 1)
  )
  return { bounds, scale, visible }
}

export function minimapPoint(projection: MinimapProjection, world: CanvasPoint): CanvasPoint {
  return {
    x: MINIMAP.padding + (world.x - projection.bounds.x) * projection.scale,
    y: MINIMAP.padding + (world.y - projection.bounds.y) * projection.scale
  }
}

/** The viewport origin that centres the stage on a point picked in the minimap. */
export function originForMinimapPoint(
  projection: MinimapProjection,
  mini: CanvasPoint,
  viewport: CanvasViewport,
  stage: { width: number; height: number }
): CanvasPoint {
  const center = {
    x: projection.bounds.x + (mini.x - MINIMAP.padding) / projection.scale,
    y: projection.bounds.y + (mini.y - MINIMAP.padding) / projection.scale
  }
  return {
    x: center.x - stage.width / (viewport.zoom * 2),
    y: center.y - stage.height / (viewport.zoom * 2)
  }
}
