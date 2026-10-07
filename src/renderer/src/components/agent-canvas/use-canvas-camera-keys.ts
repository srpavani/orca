import React from 'react'
import { findNode } from '../../../../shared/spatial-canvas/levels'
import {
  bindCanvasStage,
  canvasStageSize,
  glideToRects,
  toggleCardZoom
} from './agent-canvas-camera'
import { getAgentCanvasState } from './agent-canvas-store'

/** The card a key acts on: the live pane holding focus, else the primary selection. */
function focusedCardId(target: EventTarget | null): string | null {
  const card = target instanceof Element ? target.closest('[data-canvas-node-id]') : null
  return card?.getAttribute('data-canvas-node-id') ?? getAgentCanvasState().selectedNodeId
}

/**
 * The reference's camera keys: Ctrl/⌘+\ zooms into the focused card and back,
 * Ctrl/⌘+Alt+\ frames the selection. Why also inside a live terminal: that is
 * where the user is when they want the card bigger, as in the reference.
 */
export function useCanvasCameraKeys(surfaceRef: React.RefObject<HTMLDivElement | null>): void {
  React.useEffect(() => {
    bindCanvasStage(surfaceRef.current)
    return () => bindCanvasStage(null)
  }, [surfaceRef])
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.code !== 'Backslash') {
        return
      }
      if (document.querySelector('[role=dialog]')) {
        return
      }
      const state = getAgentCanvasState()
      const stage = canvasStageSize()
      if (event.altKey) {
        const rects = state.selectedNodeIds
          .map((id) => findNode(state.document, id)?.frame)
          .filter((frame) => frame !== undefined)
        if (glideToRects(rects, stage)) {
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }
      const nodeId = focusedCardId(event.target)
      const node = nodeId === null ? null : findNode(state.document, nodeId)
      if (node) {
        event.preventDefault()
        event.stopPropagation()
        toggleCardZoom(node.id, node.frame, stage)
      }
    }
    // Why capture: a focused terminal would otherwise read the key as its own input.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}
