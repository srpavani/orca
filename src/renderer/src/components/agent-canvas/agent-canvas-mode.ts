import { useSyncExternalStore } from 'react'
import type { CanvasRect } from '../../../../shared/spatial-canvas/types'

/**
 * The reference's canvasModeAtom: which tool the main toolbar has armed. In a
 * creation mode the next press on empty board places that kind of card there
 * (a click centres a default-sized card; a drag sizes it), then the mode falls
 * back to select — exactly as the reference's creation gesture does.
 */
export type CanvasMode = 'select' | 'terminal' | 'note' | 'fileTree' | 'portal' | 'text' | 'draw'

export const CREATION_MODES: readonly CanvasMode[] = [
  'terminal',
  'note',
  'fileTree',
  'portal',
  'text'
]

let mode: CanvasMode = 'select'
/** World frame the last creation gesture drew; the terminal/portal sheets place their card in it. */
let pendingPlacement: CanvasRect | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function getCanvasMode(): CanvasMode {
  return mode
}

export function setCanvasMode(next: CanvasMode): void {
  if (next !== mode) {
    mode = next
    emit()
  }
}

export function useCanvasMode(): CanvasMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => mode,
    () => mode
  )
}

export function isCreationMode(value: CanvasMode): boolean {
  return CREATION_MODES.includes(value)
}

export function setPendingPlacement(frame: CanvasRect | null): void {
  pendingPlacement = frame
}

/** Reads and clears the placement, so a later menu-made card does not reuse it. */
export function takePendingPlacement(): CanvasRect | null {
  const at = pendingPlacement
  pendingPlacement = null
  return at
}
