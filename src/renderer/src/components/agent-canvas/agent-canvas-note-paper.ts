import type { CanvasNoteColor } from '../../../../shared/spatial-canvas/types'

/**
 * Sticky-note paper. A note is paper: it keeps its colour in both themes, so
 * the words a user wrote it for stay legible and the note keeps its identity.
 * Ink colours are picked to hold contrast on each paper, and both channels are
 * theme tokens rather than hex values so the design lint can see them.
 */
export const NOTE_PAPER_CLASS: Record<CanvasNoteColor, string> = {
  yellow: 'bg-note-yellow text-note-yellow-ink',
  pink: 'bg-note-pink text-note-pink-ink',
  blue: 'bg-note-blue text-note-blue-ink',
  green: 'bg-note-green text-note-green-ink',
  orange: 'bg-note-orange text-note-orange-ink',
  purple: 'bg-note-purple text-note-purple-ink',
  white: 'bg-note-paper text-note-paper-ink',
  charcoal: 'bg-note-charcoal text-note-charcoal-ink',
  slate: 'bg-note-slate text-note-slate-ink',
  midnight: 'bg-note-midnight text-note-midnight-ink'
}

/** Swatch order for the note colour picker, light papers first. */
export const NOTE_COLOR_ORDER: readonly CanvasNoteColor[] = [
  'yellow',
  'pink',
  'blue',
  'green',
  'orange',
  'purple',
  'white',
  'charcoal',
  'slate',
  'midnight'
]

/** English names, the fallback when a locale has no entry for a colour key. */
export const NOTE_COLOR_NAMES: Record<CanvasNoteColor, string> = {
  yellow: 'Yellow',
  pink: 'Pink',
  blue: 'Blue',
  green: 'Green',
  orange: 'Orange',
  purple: 'Purple',
  white: 'White',
  charcoal: 'Charcoal',
  slate: 'Slate',
  midnight: 'Midnight'
}

export const NOTE_COLOR_KEYS: Record<CanvasNoteColor, string> = {
  yellow: 'auto.components.agentCanvas.noteColorYellow',
  pink: 'auto.components.agentCanvas.noteColorPink',
  blue: 'auto.components.agentCanvas.noteColorBlue',
  green: 'auto.components.agentCanvas.noteColorGreen',
  orange: 'auto.components.agentCanvas.noteColorOrange',
  purple: 'auto.components.agentCanvas.noteColorPurple',
  white: 'auto.components.agentCanvas.noteColorWhite',
  charcoal: 'auto.components.agentCanvas.noteColorCharcoal',
  slate: 'auto.components.agentCanvas.noteColorSlate',
  midnight: 'auto.components.agentCanvas.noteColorMidnight'
}

export function parseNoteColor(value: unknown): CanvasNoteColor | undefined {
  return typeof value === 'string' && value in NOTE_PAPER_CLASS
    ? (value as CanvasNoteColor)
    : undefined
}
