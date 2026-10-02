import { useSyncExternalStore } from 'react'

/** The floor-hooks sheet has its own open state, like the other canvas sheets. */
let open = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function openFloorHooksSheet(): void {
  if (!open) {
    open = true
    emit()
  }
}

export function closeFloorHooksSheet(): void {
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

export function useFloorHooksSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, getOpen, getOpen)
}
