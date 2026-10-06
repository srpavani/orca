import type { CanvasPoint, CanvasRect } from './types'

/**
 * The reference's creation gesture geometry (useCreationGesture): a press and
 * release closer than MIN_DRAG_SIZE is a click and centres a default-sized card
 * on the press; a longer drag spans the dragged box, snapped outward to the grid.
 */
export const CANVAS_GRID_STEP = 20
export const MIN_DRAG_SIZE = 24

/** Default sizes per tool, from the reference's NOTE_DEFAULT, TERMINAL_DEFAULT$1, PORTAL_DEFAULT$1, FILE_TREE_DEFAULT, TEXT_BLOCK_SIZE. */
export const CREATION_DEFAULT_SIZE = {
  note: { width: 260, height: 220 },
  terminal: { width: 560, height: 360 },
  portal: { width: 800, height: 600 },
  fileTree: { width: 300, height: 300 },
  text: { width: 200, height: 36 }
} as const

export function snapToGrid(value: number): number {
  return Math.round(value / CANVAS_GRID_STEP) * CANVAS_GRID_STEP
}

export function snapRectOutward(a: CanvasPoint, b: CanvasPoint): CanvasRect {
  const step = CANVAS_GRID_STEP
  const x = Math.floor(Math.min(a.x, b.x) / step) * step
  const y = Math.floor(Math.min(a.y, b.y) / step) * step
  const maxX = Math.ceil(Math.max(a.x, b.x) / step) * step
  const maxY = Math.ceil(Math.max(a.y, b.y) / step) * step
  return { x, y, width: maxX - x, height: maxY - y }
}

export function frameCenteredAt(
  center: CanvasPoint,
  size: { width: number; height: number }
): CanvasRect {
  const width = Math.max(CANVAS_GRID_STEP, snapToGrid(size.width))
  const height = Math.max(CANVAS_GRID_STEP, snapToGrid(size.height))
  return {
    x: snapToGrid(center.x - width / 2),
    y: snapToGrid(center.y - height / 2),
    width,
    height
  }
}

function isClick(start: CanvasPoint, current: CanvasPoint): boolean {
  return (
    Math.abs(current.x - start.x) < MIN_DRAG_SIZE && Math.abs(current.y - start.y) < MIN_DRAG_SIZE
  )
}

export function frameFromDrag(
  start: CanvasPoint,
  current: CanvasPoint,
  defaultSize: { width: number; height: number }
): CanvasRect {
  return isClick(start, current)
    ? frameCenteredAt(start, defaultSize)
    : snapRectOutward(start, current)
}

/** A text block anchors its top-left on the press, unlike every other card. */
export function textFrameFromDrag(start: CanvasPoint, current: CanvasPoint): CanvasRect {
  return isClick(start, current)
    ? { x: start.x, y: start.y, ...CREATION_DEFAULT_SIZE.text }
    : snapRectOutward(start, current)
}
