/**
 * The floor stack, with Maestri's numbers.
 *
 * A floor is not a tab you switch to — it is a sheet in a stack. Turning the
 * overview on tilts the live canvas back and hands the stage to the other
 * floors, which recede above and below it. Every constant here was read off
 * Maestri's own build so the two stacks read as the same object, and this file
 * holds the geometry only: no DOM, so the maths is testable on its own.
 */

/** How far the live canvas tips back, in degrees. */
export const FLOOR_TILT_DEGREES = 55
/** How much the sheets shrink as the stack engages. */
export const FLOOR_OVERVIEW_SCALE = 0.55
/** World gap between two sheets in the stack. */
export const FLOOR_SPACING = 130
/** The live canvas' own drop when the overview engages. */
export const FLOOR_LIVE_OFFSET_Y = 130
/** perspective = stage height / this, so the tilt reads the same on any window. */
export const FLOOR_PERSPECTIVE = 0.5
/** Extra gap that grows with distance, so the stack fans out instead of tiling. */
export const FLOOR_PERSPECTIVE_GAP = 30
/** Ghost opacity for floors stacked above the live one. */
export const FLOOR_OPACITY_ABOVE = 0.35
/** Ghost opacity for floors stacked below it — nearer, so more present. */
export const FLOOR_OPACITY_BELOW = 0.7
export const FLOOR_CORNER_RADIUS = 12
/** Graph-paper cell of a floor card, matching the canvas grid. */
export const FLOOR_GRID_CELL_PX = 20
/** Perspective fallback for a stage that has not been measured yet. */
export const FLOOR_PERSPECTIVE_FALLBACK_PX = 1600

export type FloorStackLayer = 'above' | 'below'

export function clampToUnit(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

/**
 * Where a sheet sits relative to the live canvas. `relativePosition` is 0 for the
 * live floor, negative going down the stack and positive going up.
 */
export function floorYOffset(relativePosition: number): number {
  return (
    -relativePosition * FLOOR_SPACING +
    FLOOR_LIVE_OFFSET_Y -
    FLOOR_PERSPECTIVE_GAP * clampToUnit(relativePosition)
  )
}

/**
 * A ghost is drawn by the layer that owns its side of the live canvas: floors
 * below show behind it, floors above show in front. A floor on the far side of
 * the live one is simply not drawn, which is what keeps the stack readable.
 */
export function floorGhostOpacity(relativePosition: number, layer: FloorStackLayer): number {
  if (relativePosition === 0) {
    return 0
  }
  const isAbove = relativePosition > 0
  if (isAbove && layer === 'above') {
    return FLOOR_OPACITY_ABOVE
  }
  if (!isAbove && layer === 'below') {
    return FLOOR_OPACITY_BELOW
  }
  return 0
}

/** CSS perspective for the stage. Scaling by its height keeps the tilt proportional. */
export function floorPerspectivePx(stageHeight: number): number {
  if (!Number.isFinite(stageHeight) || stageHeight <= 0) {
    return FLOOR_PERSPECTIVE_FALLBACK_PX
  }
  return stageHeight / FLOOR_PERSPECTIVE
}

export type FloorStackItem = {
  key: string
  name: string
  detail: string
  /** Offset from the live floor: 0 is live, negative down, positive up. */
  relativePosition: number
  color: string | null
  /** Picture of the board as it last looked, shown on the sheet; null shows the name. */
  snapshot?: string | null
}

/**
 * Orders floors for the stack and numbers them relative to the live one. The
 * ground floor is the bottom of the stack, the live floor is 0, and floors
 * above it count up — which is the same direction `floorYOffset` lifts them.
 */
export function buildFloorStack(
  floors: readonly { id: string | null; name: string; color?: string | null; items: number }[],
  liveId: string | null
): FloorStackItem[] {
  const liveIndex = Math.max(
    0,
    floors.findIndex((floor) => floor.id === liveId)
  )
  return floors.map((floor, index) => ({
    key: floor.id ?? 'ground',
    name: floor.name,
    detail: floor.items === 1 ? '1 item' : `${floor.items} items`,
    relativePosition: index - liveIndex,
    color: floor.color ?? null
  }))
}

/** Floors drawn behind the live canvas, nearest first. */
export function floorsBelow(stack: readonly FloorStackItem[]): FloorStackItem[] {
  return stack
    .filter((item) => item.relativePosition < 0)
    .sort((a, b) => a.relativePosition - b.relativePosition)
}

/** Floors drawn in front of the live canvas, nearest first. */
export function floorsAbove(stack: readonly FloorStackItem[]): FloorStackItem[] {
  return stack
    .filter((item) => item.relativePosition > 0)
    .sort((a, b) => b.relativePosition - a.relativePosition)
}
