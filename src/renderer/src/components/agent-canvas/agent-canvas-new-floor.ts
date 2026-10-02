import { useSyncExternalStore } from 'react'

/** The new-floor sheet is rich enough to need its own open/close state. */
let open = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function openNewFloorSheet(): void {
  if (!open) {
    open = true
    emit()
  }
}

export function closeNewFloorSheet(): void {
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

export function useNewFloorSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getOpen, getOpen)
}
