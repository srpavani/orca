import React from 'react'
import {
  nextZoomLevel,
  panBy,
  screenToWorld,
  zoomAtPoint
} from '../../../../shared/spatial-canvas/geometry'
import { nodesCoveringPoint } from '../../../../shared/spatial-canvas/levels'
import type { CanvasNode, CanvasPoint } from '../../../../shared/spatial-canvas/types'
import {
  connectCanvasNodes,
  getAgentCanvasState,
  moveCanvasNode,
  selectCanvasNode,
  setCanvasViewport
} from './agent-canvas-store'

type Gesture =
  | { type: 'pan'; last: CanvasPoint }
  | { type: 'drag'; nodeId: string; grabOffset: CanvasPoint }
  | { type: 'wire'; fromNode: CanvasNode }

export type PendingWire = { fromNode: CanvasNode; cursor: CanvasPoint } | null

function localPoint(
  event: { clientX: number; clientY: number },
  element: HTMLElement
): CanvasPoint {
  const bounds = element.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

export function useAgentCanvasGestures(surfaceRef: React.RefObject<HTMLDivElement | null>): {
  pendingWire: PendingWire
  onSurfacePointerDown: (event: React.PointerEvent) => void
  onHeaderPointerDown: (event: React.PointerEvent, node: CanvasNode) => void
  onPortPointerDown: (event: React.PointerEvent, node: CanvasNode) => void
} {
  const gestureRef = React.useRef<Gesture | null>(null)
  const [pendingWire, setPendingWire] = React.useState<PendingWire>(null)

  React.useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) {
      return
    }
    const onMove = (event: PointerEvent): void => {
      const gesture = gestureRef.current
      if (!gesture) {
        return
      }
      const point = localPoint(event, surface)
      const { viewport } = getAgentCanvasState()
      if (gesture.type === 'pan') {
        setCanvasViewport(
          panBy(viewport, { x: point.x - gesture.last.x, y: point.y - gesture.last.y })
        )
        gestureRef.current = { type: 'pan', last: point }
      } else if (gesture.type === 'drag') {
        const world = screenToWorld(point, viewport)
        moveCanvasNode(gesture.nodeId, {
          x: world.x - gesture.grabOffset.x,
          y: world.y - gesture.grabOffset.y
        })
      } else {
        setPendingWire({ fromNode: gesture.fromNode, cursor: point })
      }
    }
    const onUp = (event: PointerEvent): void => {
      const gesture = gestureRef.current
      gestureRef.current = null
      if (gesture?.type !== 'wire') {
        return
      }
      setPendingWire(null)
      const { document, viewport } = getAgentCanvasState()
      const world = screenToWorld(localPoint(event, surface), viewport)
      // Draw order puts the topmost node last.
      const target = nodesCoveringPoint(document, world).findLast(
        (node) => node.id !== gesture.fromNode.id
      )
      if (target) {
        connectCanvasNodes(gesture.fromNode.id, target.id)
      }
    }
    // Why: wheel must be non-passive to stop the page scrolling under the canvas.
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const { viewport } = getAgentCanvasState()
      if (event.ctrlKey || event.metaKey) {
        // Trackpad pinch arrives as ctrl+wheel with small deltas; scale proportionally.
        const step = Math.min(Math.abs(event.deltaY), 25)
        const zoom = nextZoomLevel(viewport.zoom, event.deltaY < 0 ? 1 : -1, step)
        setCanvasViewport(zoomAtPoint(viewport, zoom, localPoint(event, surface)))
        return
      }
      setCanvasViewport(panBy(viewport, { x: -event.deltaX, y: -event.deltaY }))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    surface.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      surface.removeEventListener('wheel', onWheel)
    }
  }, [surfaceRef])

  const onSurfacePointerDown = React.useCallback(
    (event: React.PointerEvent) => {
      const surface = surfaceRef.current
      if (!surface || event.button > 1) {
        return
      }
      selectCanvasNode(null)
      gestureRef.current = { type: 'pan', last: localPoint(event, surface) }
    },
    [surfaceRef]
  )

  const onHeaderPointerDown = React.useCallback(
    (event: React.PointerEvent, node: CanvasNode) => {
      const surface = surfaceRef.current
      if (!surface || event.button !== 0) {
        return
      }
      event.stopPropagation()
      selectCanvasNode(node.id)
      const world = screenToWorld(localPoint(event, surface), getAgentCanvasState().viewport)
      gestureRef.current = {
        type: 'drag',
        nodeId: node.id,
        grabOffset: { x: world.x - node.frame.x, y: world.y - node.frame.y }
      }
    },
    [surfaceRef]
  )

  const onPortPointerDown = React.useCallback(
    (event: React.PointerEvent, node: CanvasNode) => {
      const surface = surfaceRef.current
      if (!surface || event.button !== 0) {
        return
      }
      event.stopPropagation()
      gestureRef.current = { type: 'wire', fromNode: node }
      setPendingWire({ fromNode: node, cursor: localPoint(event, surface) })
    },
    [surfaceRef]
  )

  return { pendingWire, onSurfacePointerDown, onHeaderPointerDown, onPortPointerDown }
}
