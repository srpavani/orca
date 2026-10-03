import React from 'react'
import {
  createFloorScrollSwitch,
  nextFloorIndex
} from '../../../../shared/spatial-canvas/floor-scroll-switch'
import { levelsOf } from '../../../../shared/spatial-canvas/levels'
import { switchCanvasLevel } from './agent-canvas-level-actions'
import { getAgentCanvasState, setCanvasViewState } from './agent-canvas-store'

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function insideFloorList(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-floor-sidebar]') !== null
}

/** One gesture memory for the whole app, however many times the page mounts. */
const scroll = createFloorScrollSwitch(() => performance.now())
const handledWheels = new WeakSet<WheelEvent>()

/** True when the wheel is over the floor list and the list has room to scroll that way. */
function listCanScroll(target: EventTarget | null, deltaY: number): boolean {
  const list =
    target instanceof Element ? target.closest('[data-floor-sidebar] .overflow-y-auto') : null
  if (!(list instanceof HTMLElement) || list.scrollHeight <= list.clientHeight + 1) {
    return false
  }
  return deltaY < 0
    ? list.scrollTop > 0
    : list.scrollTop + list.clientHeight < list.scrollHeight - 1
}

/** Moves the live floor `delta` steps up (+1) or down (-1) the stack. */
function stepFloor(delta: number): void {
  const { document, activeLevelId } = getAgentCanvasState()
  const stops = levelsOf(document)
  const current = Math.max(
    0,
    stops.findIndex((stop) => stop.id === activeLevelId)
  )
  const next = nextFloorIndex(current, delta, stops.length)
  const stop = stops[next]
  if (stop && next !== current) {
    switchCanvasLevel(stop.id)
  }
}

/**
 * The reference's overview controls (useFloorOverview): Ctrl+Shift+\ opens and
 * closes the stack; while it is open, Up/Down and the wheel step through the
 * floors — so the sheets slide past — and Enter or Escape steps back in.
 * Ignored while typing, while a dialog is open, and inside the floor list,
 * which has its own arrow-key handling.
 */
export function useFloorOverviewKeys(): void {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const overview = getAgentCanvasState().floorOverview
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Backslash') {
        event.preventDefault()
        event.stopPropagation()
        setCanvasViewState({ floorOverview: !overview })
        return
      }
      if (!overview || isTextEntry(event.target) || document.querySelector('[role=dialog]')) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (insideFloorList(event.target)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        stepFloor(event.key === 'ArrowUp' ? 1 : -1)
        return
      }
      if (event.key === 'Enter' || event.key === 'Escape') {
        if (event.key === 'Enter' && insideFloorList(event.target)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        setCanvasViewState({ floorOverview: false })
      }
    }
    const onWheel = (event: WheelEvent): void => {
      if (!getAgentCanvasState().floorOverview || document.querySelector('[role=dialog]')) {
        return
      }
      // Why the list only keeps the wheel when it can still scroll that way: a long
      // stack must stay reachable, but over a short list (or the pill) the wheel is
      // the floor switch — it used to fall through and pan the board instead.
      if (listCanScroll(event.target, event.deltaY)) {
        event.stopPropagation()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      // Why the event is marked: if this page is ever mounted twice, the second
      // listener must not count the same notch again (one notch, one floor).
      if (handledWheels.has(event)) {
        return
      }
      handledWheels.add(event)
      const direction = scroll.handle(event)
      if (direction !== null) {
        stepFloor(direction)
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [])
}
