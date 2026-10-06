import { snapToGrid } from './creation-frame'
import type { CanvasRect } from './types'

/** The reference's ALIGN_ACTION_IDS. */
export type CanvasAlignment =
  | 'left'
  | 'centerHorizontally'
  | 'right'
  | 'top'
  | 'centerVertically'
  | 'bottom'
  | 'distributeHorizontally'
  | 'distributeVertically'

/** Distributing needs a middle card to move; aligning needs two. */
export function minimumSelectionCount(alignment: CanvasAlignment): number {
  return alignment === 'distributeHorizontally' || alignment === 'distributeVertically' ? 3 : 2
}

function distributed(
  frames: ReadonlyMap<string, CanvasRect>,
  bounds: CanvasRect,
  horizontally: boolean
): Map<string, CanvasRect> {
  const ordered = [...frames.entries()].sort(([, a], [, b]) => {
    if (horizontally) {
      return a.x === b.x ? a.y - b.y : a.x - b.x
    }
    return a.y === b.y ? a.x - b.x : a.y - b.y
  })
  const span = horizontally ? bounds.width : bounds.height
  const occupied = ordered.reduce(
    (sum, [, frame]) => sum + (horizontally ? frame.width : frame.height),
    0
  )
  const gap = snapToGrid((span - occupied) / (ordered.length - 1))
  const result = new Map<string, CanvasRect>()
  let position = snapToGrid(horizontally ? bounds.x : bounds.y)
  for (const [id, frame] of ordered) {
    result.set(id, horizontally ? { ...frame, x: position } : { ...frame, y: position })
    position += (horizontally ? frame.width : frame.height) + gap
  }
  return result
}

/**
 * The reference's alignedFrames: the new frame per card, with every edge or
 * centre snapped to the 20px grid. Fewer cards than the alignment needs moves
 * nothing.
 */
export function alignedFrames(
  frames: ReadonlyMap<string, CanvasRect>,
  alignment: CanvasAlignment
): Map<string, CanvasRect> {
  if (frames.size < minimumSelectionCount(alignment)) {
    return new Map()
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const frame of frames.values()) {
    minX = Math.min(minX, frame.x)
    minY = Math.min(minY, frame.y)
    maxX = Math.max(maxX, frame.x + frame.width)
    maxY = Math.max(maxY, frame.y + frame.height)
  }
  const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  const map = (transform: (frame: CanvasRect) => CanvasRect): Map<string, CanvasRect> =>
    new Map([...frames].map(([id, frame]) => [id, transform(frame)]))
  switch (alignment) {
    case 'left': {
      const edge = snapToGrid(minX)
      return map((frame) => ({ ...frame, x: edge }))
    }
    case 'centerHorizontally': {
      const center = snapToGrid((minX + maxX) / 2)
      return map((frame) => ({ ...frame, x: center - frame.width / 2 }))
    }
    case 'right': {
      const edge = snapToGrid(maxX)
      return map((frame) => ({ ...frame, x: edge - frame.width }))
    }
    case 'top': {
      const edge = snapToGrid(minY)
      return map((frame) => ({ ...frame, y: edge }))
    }
    case 'centerVertically': {
      const center = snapToGrid((minY + maxY) / 2)
      return map((frame) => ({ ...frame, y: center - frame.height / 2 }))
    }
    case 'bottom': {
      const edge = snapToGrid(maxY)
      return map((frame) => ({ ...frame, y: edge - frame.height }))
    }
    case 'distributeHorizontally':
      return distributed(frames, bounds, true)
    case 'distributeVertically':
      return distributed(frames, bounds, false)
  }
}
