import { useSyncExternalStore } from 'react'
import type { TuiAgent } from '../../../../shared/tui-agent'

/**
 * The new-terminal form is a sheet, not a question, so it keeps its own tiny
 * store: the board asks for it with a prefill (the preset the user picked in the
 * menu) and the form owns everything else while it is open.
 */
export type NewTerminalRequest = {
  id: number
  /** Preset the user already chose, when the sheet was opened from the menu. */
  presetAgent?: TuiAgent
  presetLabel?: string
}

let current: NewTerminalRequest | null = null
let nextId = 1
const listeners = new Set<() => void>()

export function openNewTerminalSheet(preset?: { agent?: TuiAgent; label?: string }): void {
  current = {
    id: nextId,
    ...(preset?.agent ? { presetAgent: preset.agent } : {}),
    ...(preset?.label ? { presetLabel: preset.label } : {})
  }
  nextId += 1
  emit()
}

export function closeNewTerminalSheet(): void {
  if (current !== null) {
    current = null
    emit()
  }
}

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function getRequest(): NewTerminalRequest | null {
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useNewTerminalRequest(): NewTerminalRequest | null {
  return useSyncExternalStore(subscribe, getRequest, getRequest)
}
