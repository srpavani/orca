import React from 'react'
import { useSyncExternalStore } from 'react'
import { levelContents } from '../../../../shared/spatial-canvas/levels'
import type { CanvasEdge, CanvasNodeId } from '../../../../shared/spatial-canvas/types'
import { connectCanvasNodes, disconnectCanvasEdge, getAgentCanvasState } from './agent-canvas-store'

/**
 * The reference's connect mode (useConnectMode): press Connect on a selected
 * card — or the C key — and the next card clicked becomes the other end of the
 * wire. A click on empty board, or Escape, cancels. Dragging from a card's port
 * still works too.
 */
let connectingFrom: CanvasNodeId | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function startCanvasConnect(nodeId: CanvasNodeId): void {
  connectingFrom = nodeId
  emit()
}

export function cancelCanvasConnect(): void {
  if (connectingFrom !== null) {
    connectingFrom = null
    emit()
  }
}

export function canvasConnectingFrom(): CanvasNodeId | null {
  return connectingFrom
}

export function useCanvasConnectingFrom(): CanvasNodeId | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => connectingFrom,
    () => connectingFrom
  )
}

/** Wires the pending source to `toNodeId`; false when that pair cannot be wired. */
export function finishCanvasConnect(toNodeId: CanvasNodeId): boolean {
  const from = connectingFrom
  cancelCanvasConnect()
  if (from === null || from === toNodeId) {
    return false
  }
  return connectCanvasNodes(from, toNodeId)
}

/** The wires touching a card on the floor in view. */
export function canvasEdgesOf(nodeId: CanvasNodeId): CanvasEdge[] {
  const { document, activeLevelId } = getAgentCanvasState()
  const floor = levelContents(document, activeLevelId) ?? document.root
  return floor.edges.filter((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId)
}

export function disconnectCanvasEdges(edgeIds: readonly string[]): void {
  for (const id of edgeIds) {
    disconnectCanvasEdge(id)
  }
}

/**
 * While connect mode is on, a press on a card finishes the wire and a press on
 * empty board cancels it; Escape cancels. Capture phase, so the press is taken
 * before it selects or drags anything.
 */
export function useCanvasConnectMode(surfaceRef: React.RefObject<HTMLDivElement | null>): void {
  React.useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) {
      return
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (connectingFrom === null || event.button !== 0) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      // The toolbar itself (where Connect was pressed) must not cancel the mode.
      if (target?.closest('[data-canvas-node-toolbar]')) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const card = target?.closest<HTMLElement>('[data-canvas-node-id]')
      const toId = card?.dataset.canvasNodeId
      if (toId) {
        finishCanvasConnect(toId)
      } else {
        cancelCanvasConnect()
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && connectingFrom !== null) {
        event.preventDefault()
        event.stopPropagation()
        cancelCanvasConnect()
      }
    }
    surface.addEventListener('pointerdown', onPointerDown, { capture: true })
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      surface.removeEventListener('pointerdown', onPointerDown, { capture: true })
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [surfaceRef])
}
