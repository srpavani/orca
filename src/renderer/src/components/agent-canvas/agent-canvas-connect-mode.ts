import React, { useSyncExternalStore } from 'react'
import { levelContents } from '../../../../shared/spatial-canvas/levels'
import type { CanvasEdge, CanvasNode, CanvasNodeId } from '../../../../shared/spatial-canvas/types'
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

/** Floating chrome over the board: toolbars, corner buttons, the floor list, the selection bar. */
const CHROME_SELECTOR =
  '[data-canvas-chrome], [data-canvas-node-toolbar], [data-canvas-selection-bar], [data-radix-popper-content-wrapper]'

/** True when a press landed on the board's chrome rather than on the board itself. */
export function isCanvasChromeTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CHROME_SELECTOR) !== null
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
export function useCanvasConnectMode(
  surfaceRef: React.RefObject<HTMLDivElement | null>
): { x: number; y: number } | null {
  // The reference's connectingLineEndpoint: where the armed wire's loose end is,
  // so the preview line follows the pointer from Connect until the wire lands.
  const [cursor, setCursor] = React.useState<{ x: number; y: number } | null>(null)
  const armed = useCanvasConnectingFrom() !== null
  React.useEffect(() => {
    const surface = surfaceRef.current
    if (!armed || !surface) {
      setCursor(null)
      return
    }
    const onMove = (event: PointerEvent): void => {
      const rect = surface.getBoundingClientRect()
      setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [armed, surfaceRef])
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
      if (isCanvasChromeTarget(target)) {
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
  return armed ? cursor : null
}

/** The armed wire as the ropes draw it: its source card and the pointer, once it has moved. */
export function connectPreview(
  nodes: readonly CanvasNode[],
  fromId: CanvasNodeId | null,
  cursor: { x: number; y: number } | null
): { fromNode: CanvasNode; cursor: { x: number; y: number } } | null {
  const fromNode = fromId === null ? undefined : nodes.find((node) => node.id === fromId)
  return fromNode && cursor ? { fromNode, cursor } : null
}
