import { useSyncExternalStore } from 'react'

/**
 * The canvas needs a few small questions answered: a floor name, a portal URL, a
 * branch, a confirmation. Electron's renderer does not implement `window.prompt`
 * (it returns null without a word), so every one of those goes through this
 * store and one mounted dialog instead.
 */
export type CanvasPromptKind = 'text' | 'confirm' | 'notice'

export type CanvasPromptRequest = {
  id: number
  kind: CanvasPromptKind
  title: string
  description?: string
  label?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  destructive?: boolean
  onSubmit: (value: string) => void
}

let current: CanvasPromptRequest | null = null
let nextId = 1
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function openCanvasPrompt(request: Omit<CanvasPromptRequest, 'id'>): void {
  current = { ...request, id: nextId }
  nextId += 1
  emit()
}

export function closeCanvasPrompt(): void {
  if (current !== null) {
    current = null
    emit()
  }
}

export function getCanvasPrompt(): CanvasPromptRequest | null {
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCanvasPrompt(): CanvasPromptRequest | null {
  return useSyncExternalStore(subscribe, getCanvasPrompt, getCanvasPrompt)
}
