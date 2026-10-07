import { useSyncExternalStore } from 'react'
import { getAgentCanvasState, setCanvasViewState } from './agent-canvas-store'

/** The reference's SNAPSHOT_MAX_WIDTH and CAPTURE_TIMEOUT_MS. */
const SNAPSHOT_MAX_WIDTH = 800
const CAPTURE_TIMEOUT_MS = 250

/** Picture of each floor as it last looked on screen, by floor key ('ground' or the level id). */
let snapshots: ReadonlyMap<string, string> = new Map()
const listeners = new Set<() => void>()

function emit(next: ReadonlyMap<string, string>): void {
  snapshots = next
  for (const listener of listeners) {
    listener()
  }
}

export function floorSnapshotKey(levelId: string | null): string {
  return levelId ?? 'ground'
}

export function useFloorSnapshots(): ReadonlyMap<string, string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshots,
    () => snapshots
  )
}

/** Drops every picture: the theme changed, so they no longer match the board. */
export function clearFloorSnapshots(): void {
  if (snapshots.size > 0) {
    emit(new Map())
  }
}

function boardElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-canvas-viewport]')
}

/** The reference's captureFloorSnapshot: the board's rectangle, or null after 250ms. */
async function captureBoard(): Promise<string | null> {
  const board = boardElement()
  const capture = window.api.shell.captureCanvasRegion
  if (!board || !capture) {
    return null
  }
  const rect = board.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) {
    return null
  }
  const timeout = new Promise<null>((resolve) =>
    window.setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS)
  )
  const shot = capture(
    { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    SNAPSHOT_MAX_WIDTH
  ).catch(() => null)
  return Promise.race([shot, timeout])
}

/**
 * Opens or closes the floor overview, as the reference's controller does:
 * opening first photographs the floor on screen so its sheet shows the board
 * when the user moves to another floor, and drops the selection, since the
 * stack is not a place to act on cards.
 */
export function toggleFloorOverview(): void {
  const { floorOverview, activeLevelId } = getAgentCanvasState()
  if (floorOverview) {
    setCanvasViewState({ floorOverview: false })
    return
  }
  const key = floorSnapshotKey(activeLevelId)
  void captureBoard().then((dataUrl) => {
    if (dataUrl) {
      emit(new Map(snapshots).set(key, dataUrl))
    }
    setCanvasViewState({ floorOverview: true })
  })
}

/**
 * The reference clears its pictures when the theme flips: a light photo on a
 * dark stack reads as a different board. Orca switches theme by class on <html>.
 */
export function watchThemeForFloorSnapshots(): () => void {
  const observer = new MutationObserver(clearFloorSnapshots)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
