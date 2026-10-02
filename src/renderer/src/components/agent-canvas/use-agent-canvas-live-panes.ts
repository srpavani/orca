import React from 'react'
import { useAppStore } from '@/store'
import { setActivityTerminalPortals } from '../activity/activity-terminal-portal'
import { buildCanvasPortals, type CanvasLivePaneRequest } from './agent-canvas-live-panes'

type SlotRegistration = Omit<CanvasLivePaneRequest, 'target' | 'focused'>

/**
 * Collects the card elements that want a live terminal and publishes them as
 * portal targets, reusing the Activity page's pane-borrowing path so the card
 * shows the real PTY rather than a second copy of the session.
 */
export function useAgentCanvasLivePanes(focusedNodeId: string | null): {
  registerSlot: (slot: SlotRegistration) => (element: HTMLElement | null) => void
} {
  const layouts = useAppStore((state) => state.terminalLayoutsByTabId)
  const [targets, setTargets] = React.useState<ReadonlyMap<string, CanvasLivePaneRequest>>(
    () => new Map()
  )
  const callbacks = React.useRef(new Map<string, (element: HTMLElement | null) => void>())

  const registerSlot = React.useCallback((slot: SlotRegistration) => {
    const key = `${slot.nodeId}|${slot.sessionId}|${slot.worktreeId}`
    const existing = callbacks.current.get(key)
    if (existing) {
      return existing
    }
    // Why: a stable ref callback per slot keeps React from detaching and re-attaching the
    // portal target on every render, which would remount the borrowed xterm each time.
    const callback = (element: HTMLElement | null): void => {
      setTargets((current) => {
        const next = new Map(current)
        if (element) {
          next.set(slot.nodeId, { ...slot, target: element, focused: false })
        } else {
          next.delete(slot.nodeId)
        }
        return next
      })
    }
    callbacks.current.set(key, callback)
    return callback
  }, [])

  const portals = React.useMemo(
    () =>
      buildCanvasPortals(
        [...targets.values()].map((request) => ({
          ...request,
          focused: request.nodeId === focusedNodeId
        })),
        layouts
      ),
    [focusedNodeId, layouts, targets]
  )

  // Why layout effect: publish before paint so the terminal moves in the same frame.
  React.useLayoutEffect(() => {
    setActivityTerminalPortals(portals)
  }, [portals])

  // Why: only unmount clears the portals; clearing on each change would flash the panes back.
  React.useEffect(() => () => setActivityTerminalPortals([]), [])

  return { registerSlot }
}
