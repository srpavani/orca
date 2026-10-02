/**
 * New-element defaults: what the reference's "New element defaults" submenu
 * adopts from a card (Use this size, Use this color). Sizes are snapped to the
 * grid and clamped to the reference's ranges, so one odd card cannot make every
 * later card unusable.
 */

import { CANVAS_GRID_CELL } from './canvas-appearance'
import type { CanvasNode, CanvasNoteColor } from './types'

type Size = { width: number; height: number }
type Range = { width: readonly [number, number]; height: readonly [number, number] }

export type CanvasElementDefaults = {
  noteSize?: Size
  noteColor?: CanvasNoteColor
  sessionSize?: Size
  portalSize?: Size
}

/** The reference's NOTE_/TERMINAL_/PORTAL_SIZE_RANGE. */
export const NOTE_SIZE_RANGE: Range = { width: [100, 800], height: [60, 600] }
export const SESSION_SIZE_RANGE: Range = { width: [200, 1600], height: [120, 1200] }
export const PORTAL_SIZE_RANGE: Range = { width: [400, 2400], height: [300, 1600] }

function clamp(value: number, [low, high]: readonly [number, number]): number {
  return Math.min(Math.max(value, low), high)
}

function snap(value: number): number {
  return Math.round(value / CANVAS_GRID_CELL) * CANVAS_GRID_CELL
}

export function adoptedSize(frame: Size, range: Range): Size {
  return {
    width: clamp(snap(frame.width), range.width),
    height: clamp(snap(frame.height), range.height)
  }
}

export function sameSize(left: Size | undefined, right: Size): boolean {
  return left !== undefined && left.width === right.width && left.height === right.height
}

export type ElementDefaultChoice =
  | { kind: 'size'; field: 'noteSize' | 'sessionSize' | 'portalSize'; size: Size; current: boolean }
  | { kind: 'color'; color: CanvasNoteColor; current: boolean }

/**
 * What a card can lend the defaults, each marked `current` when adopting it
 * would change nothing (the reference disables those items). Cards of other
 * kinds offer nothing.
 */
export function elementDefaultChoices(
  node: CanvasNode,
  defaults: CanvasElementDefaults
): ElementDefaultChoice[] {
  const content = node.content
  if (content.kind === 'session') {
    const size = adoptedSize(node.frame, SESSION_SIZE_RANGE)
    return [
      { kind: 'size', field: 'sessionSize', size, current: sameSize(defaults.sessionSize, size) }
    ]
  }
  if (content.kind === 'portal') {
    const size = adoptedSize(node.frame, PORTAL_SIZE_RANGE)
    return [
      { kind: 'size', field: 'portalSize', size, current: sameSize(defaults.portalSize, size) }
    ]
  }
  if (content.kind === 'note') {
    const size = adoptedSize(node.frame, NOTE_SIZE_RANGE)
    const color = content.color ?? 'yellow'
    return [
      { kind: 'size', field: 'noteSize', size, current: sameSize(defaults.noteSize, size) },
      { kind: 'color', color, current: (defaults.noteColor ?? 'yellow') === color }
    ]
  }
  return []
}

export function applyElementDefault(
  defaults: CanvasElementDefaults,
  choice: ElementDefaultChoice
): CanvasElementDefaults {
  return choice.kind === 'size'
    ? { ...defaults, [choice.field]: choice.size }
    : { ...defaults, noteColor: choice.color }
}
