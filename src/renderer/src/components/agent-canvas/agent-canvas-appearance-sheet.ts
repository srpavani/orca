import { useSyncExternalStore } from 'react'

/** The appearance sheet's open state, like the other canvas sheets. */
let open = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function openAppearanceSheet(): void {
  if (!open) {
    open = true
    emit()
  }
}

export function closeAppearanceSheet(): void {
  if (open) {
    open = false
    emit()
  }
}

function getOpen(): boolean {
  return open
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppearanceSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getOpen, getOpen)
}
