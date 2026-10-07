import { isCanvasChromeTarget } from './agent-canvas-connect-mode'
import React from 'react'
import { screenToWorld } from '../../../../shared/spatial-canvas/geometry'
import {
  CREATION_DEFAULT_SIZE,
  frameFromDrag,
  snapRectOutward,
  textFrameFromDrag
} from '../../../../shared/spatial-canvas/creation-frame'
import type { CanvasPoint, CanvasRect } from '../../../../shared/spatial-canvas/types'
import {
  getCanvasMode,
  isCreationMode,
  setCanvasMode,
  setPendingPlacement,
  type CanvasMode
} from './agent-canvas-mode'
import { addCanvasFileTree } from './agent-canvas-file-tree-actions'
import { openNewTerminalSheet } from './agent-canvas-new-terminal'
import { addCanvasText } from './agent-canvas-node-actions'
import { addCanvasNote, getAgentCanvasState, resizeCanvasNode } from './agent-canvas-store'

/** Puts the card the armed tool makes into the frame the gesture drew. */
function createInFrame(
  mode: CanvasMode,
  frame: CanvasRect,
  onPortal: (frame: CanvasRect) => void
): void {
  const at = { x: frame.x, y: frame.y }
  const size = { width: frame.width, height: frame.height }
  if (mode === 'terminal') {
    // The sheet asks for the details; the card lands in this frame once created.
    setPendingPlacement(frame)
    openNewTerminalSheet()
    return
  }
  if (mode === 'portal') {
    onPortal(frame)
    return
  }
  const id =
    mode === 'note'
      ? addCanvasNote(at)
      : mode === 'text'
        ? addCanvasText(at)
        : addCanvasFileTree(at)
  if (id !== null) {
    resizeCanvasNode(id, size)
  }
}

/**
 * The reference's useCreationGesture: with a creation tool armed, a press on
 * empty board starts a dashed preview; release places the card (a click centres
 * the default size, a drag spans the box, both on the 20px grid) and drops the
 * tool back to Selection. Escape cancels a gesture, or disarms an idle tool.
 */
export function useCanvasCreationGesture(
  surfaceRef: React.RefObject<HTMLDivElement | null>,
  onPortal: (frame: CanvasRect) => void
): CanvasRect | null {
  const [preview, setPreview] = React.useState<CanvasRect | null>(null)
  const portalRef = React.useRef(onPortal)
  portalRef.current = onPortal

  React.useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) {
      return
    }
    let start: CanvasPoint | null = null
    let pointerId: number | null = null
    const world = (event: PointerEvent): CanvasPoint => {
      const rect = surface.getBoundingClientRect()
      return screenToWorld(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        getAgentCanvasState().viewport
      )
    }
    const cancel = (): void => {
      if (pointerId !== null && surface.hasPointerCapture(pointerId)) {
        surface.releasePointerCapture(pointerId)
      }
      start = null
      pointerId = null
      setPreview(null)
    }
    const onDown = (event: PointerEvent): void => {
      const mode = getCanvasMode()
      if (event.button !== 0 || !isCreationMode(mode)) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      // The reference's isInsideNode: pressing a card still works on that card.
      if (
        !target ||
        !surface.contains(target) ||
        target.closest('[data-canvas-node-id]') ||
        isCanvasChromeTarget(target)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      start = world(event)
      pointerId = event.pointerId
      surface.setPointerCapture(event.pointerId)
      setPreview({ ...start, width: 0, height: 0 })
    }
    const onMove = (event: PointerEvent): void => {
      if (start === null || event.pointerId !== pointerId) {
        return
      }
      setPreview(snapRectOutward(start, world(event)))
    }
    const onUp = (event: PointerEvent): void => {
      if (start === null || event.pointerId !== pointerId) {
        return
      }
      const from = start
      const to = world(event)
      const mode = getCanvasMode()
      cancel()
      if (!isCreationMode(mode)) {
        return
      }
      const frame =
        mode === 'text'
          ? textFrameFromDrag(from, to)
          : frameFromDrag(
              from,
              to,
              CREATION_DEFAULT_SIZE[mode as keyof typeof CREATION_DEFAULT_SIZE]
            )
      setCanvasMode('select')
      createInFrame(mode, frame, portalRef.current)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }
      if (start !== null) {
        event.stopPropagation()
        cancel()
        return
      }
      if (isCreationMode(getCanvasMode())) {
        event.stopPropagation()
        setCanvasMode('select')
      }
    }
    // Capture phase, so the press is the creation gesture's before the board's
    // marquee sees it.
    surface.addEventListener('pointerdown', onDown, { capture: true })
    surface.addEventListener('pointermove', onMove)
    surface.addEventListener('pointerup', onUp)
    surface.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKey, { capture: true })
    return () => {
      surface.removeEventListener('pointerdown', onDown, { capture: true })
      surface.removeEventListener('pointermove', onMove)
      surface.removeEventListener('pointerup', onUp)
      surface.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', onKey, { capture: true })
    }
  }, [surfaceRef])

  return preview
}
