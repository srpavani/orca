import React from 'react'
import {
  nextZoomLevel,
  panBy,
  screenToWorld,
  zoomAtPoint
} from '../../../../shared/spatial-canvas/geometry'
import { nodesCoveringPoint, nodesIntersectingRect } from '../../../../shared/spatial-canvas/levels'
import type { CanvasNode, CanvasPoint, CanvasRect } from '../../../../shared/spatial-canvas/types'
import {
  connectCanvasNodes,
  getAgentCanvasState,
  moveCanvasNode,
  selectCanvasNode,
  selectCanvasNodes,
  setCanvasViewport,
  toggleCanvasNodeSelection
} from './agent-canvas-store'

type Gesture =
  | { type: 'pan'; last: CanvasPoint }
  | { type: 'drag'; nodeId: string; grabOffset: CanvasPoint; moved: boolean }
  | { type: 'wire'; fromNode: CanvasNode }
  | { type: 'marquee'; start: CanvasPoint; current: CanvasPoint; additive: boolean }

export type PendingWire = { fromNode: CanvasNode; cursor: CanvasPoint } | null
/** Screen-space rectangle the user is dragging to select several nodes at once. */
export type MarqueeRect = CanvasRect | null

/** A drag shorter than this stays a click, so releasing in place does not rubber-band. */
const MARQUEE_MIN_PX = 4

function localPoint(
  event: { clientX: number; clientY: number },
  element: HTMLElement
): CanvasPoint {
  const bounds = element.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function rectBetween(start: CanvasPoint, end: CanvasPoint): CanvasRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

/**
 * Canvas pointer gestures. Left-drag on empty board draws the selection
 * rectangle; space or the middle button pans; a header drag moves a card; the
 * port handle draws a wire.
 */
export function useAgentCanvasGestures(surfaceRef: React.RefObject<HTMLDivElement | null>): {
  pendingWire: PendingWire
  marquee: MarqueeRect
  onSurfacePointerDown: (event: React.PointerEvent) => void
  onHeaderPointerDown: (event: React.PointerEvent, node: CanvasNode) => void
  onPortPointerDown: (event: React.PointerEvent, node: CanvasNode) => void
} {
  const gestureRef = React.useRef<Gesture | null>(null)
  const spaceRef = React.useRef(false)
  const [pendingWire, setPendingWire] = React.useState<PendingWire>(null)
  const [marquee, setMarquee] = React.useState<MarqueeRect>(null)

  // Why space-to-pan lives on window: the user presses it before aiming at the
  // board, and the canvas may not have focus.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Space') {
        spaceRef.current = true
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') {
        spaceRef.current = false
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

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
        gestureRef.current = { ...gesture, moved: true }
        moveCanvasNode(gesture.nodeId, {
          x: world.x - gesture.grabOffset.x,
          y: world.y - gesture.grabOffset.y
        })
      } else if (gesture.type === 'marquee') {
        gestureRef.current = { ...gesture, current: point }
        setMarquee(rectBetween(gesture.start, point))
      } else {
        setPendingWire({ fromNode: gesture.fromNode, cursor: point })
      }
    }
    const onUp = (event: PointerEvent): void => {
      const gesture = gestureRef.current
      gestureRef.current = null
      if (gesture?.type === 'marquee') {
        setMarquee(null)
        const box = rectBetween(gesture.start, localPoint(event, surface))
        const { document, viewport, selectedNodeIds } = getAgentCanvasState()
        if (box.width < MARQUEE_MIN_PX && box.height < MARQUEE_MIN_PX) {
          // A click, not a drag: clearing is the whole intent.
          selectCanvasNode(null)
          return
        }
        const world = {
          x: viewport.origin.x + box.x / viewport.zoom,
          y: viewport.origin.y + box.y / viewport.zoom,
          width: box.width / viewport.zoom,
          height: box.height / viewport.zoom
        }
        const inside = nodesIntersectingRect(document, world).map((node) => node.id)
        selectCanvasNodes(gesture.additive ? [...selectedNodeIds, ...inside] : inside)
        return
      }
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
      // Why button 1 is allowed here: middle-drag is the other way to pan, and the
      // right button belongs to the context menu.
      if (!surface || event.button > 1) {
        return
      }
      const start = localPoint(event, surface)
      if (event.button === 1 || spaceRef.current) {
        gestureRef.current = { type: 'pan', last: start }
        return
      }
      gestureRef.current = {
        type: 'marquee',
        start,
        current: start,
        additive: event.shiftKey
      }
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
      if (event.shiftKey) {
        toggleCanvasNodeSelection(node.id)
        return
      }
      selectCanvasNode(node.id)
      const world = screenToWorld(localPoint(event, surface), getAgentCanvasState().viewport)
      gestureRef.current = {
        type: 'drag',
        nodeId: node.id,
        // Why the body is not used: dragging a card by its body would fight the
        // text caret, the live terminal and the portal frame inside it.
        grabOffset: { x: world.x - node.frame.x, y: world.y - node.frame.y },
        moved: false
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
      selectCanvasNode(node.id)
      gestureRef.current = { type: 'wire', fromNode: node }
      setPendingWire({ fromNode: node, cursor: localPoint(event, surface) })
    },
    [surfaceRef]
  )

  return { pendingWire, marquee, onSurfacePointerDown, onHeaderPointerDown, onPortPointerDown }
}
