import type { CSSProperties } from 'react'
import type { CanvasViewport } from '../../../../shared/spatial-canvas/types'

/** World size of one graph-paper square, matching the canvas grid across the app. */
export const CANVAS_GRID_CELL = 20

/**
 * Graph paper: two linear-gradients crossing every cell, painted in world space
 * so the lines pan and zoom with the cards. Maestri's canvas uses lines, not
 * dots — a dot grid reads as a texture, while ruled squares read as a surface
 * you place things on.
 */
export function canvasGridStyle(viewport: CanvasViewport, devicePixelRatio = 1): CSSProperties {
  const thickness = devicePixelRatio >= 1.5 ? 0.5 : 1
  const cell = CANVAS_GRID_CELL * viewport.zoom
  const line = `color-mix(in srgb, var(--color-canvas-grid-line) ${thickness === 1 ? 50 : 100}%, transparent)`
  const vertical = `linear-gradient(to right, ${line} 0, ${line} ${thickness}px, transparent ${thickness}px, transparent 100%)`
  const horizontal = `linear-gradient(to bottom, ${line} 0, ${line} ${thickness}px, transparent ${thickness}px, transparent 100%)`
  return {
    backgroundColor: 'var(--color-canvas-surface)',
    backgroundImage: `${vertical}, ${horizontal}`,
    backgroundSize: `${cell}px ${cell}px`,
    backgroundPosition: `${-viewport.origin.x * viewport.zoom}px ${-viewport.origin.y * viewport.zoom}px`
  }
}
