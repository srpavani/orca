import React from 'react'
import {
  nextZoomLevel,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAtPoint
} from '../../../../shared/spatial-canvas/geometry'
import { levelContents, nodesCoveringPoint } from '../../../../shared/spatial-canvas/levels'
import {
  MARQUEE_MIN_PX,
  combineSelection,
  dragSet,
  draggedPositions,
  marqueeHits,
  rectBetween
} from '../../../../shared/spatial-canvas/marquee'
import type {
  CanvasLevelContents,
  CanvasNode,
  CanvasPoint,
  CanvasRect
} from '../../../../shared/spatial-canvas/types'
import {
  connectCanvasNodes,
  getAgentCanvasState,
  selectCanvasNode,
  selectCanvasNodes,
  setCanvasViewport,
  toggleCanvasNodeSelection
} from './agent-canvas-store'
import { moveCanvasNodes } from './agent-canvas-group-actions'

type Gesture =
  | { type: 'pan'; last: CanvasPoint }
  | { type: 'drag'; grabWorld: CanvasPoint; origins: Map<string, CanvasPoint>; moved: boolean }
  | { type: 'wire'; fromNode: CanvasNode }
  | {
      type: 'marquee'
      start: CanvasPoint
      /** Where the press landed in world space, fixed so a pan or zoom mid-drag cannot shift it. */
      startWorld: CanvasPoint
      additive: boolean
      /** What was selected when the press began, so shift adds to it rather than to itself. */
      before: readonly string[]
    }

export type PendingWire = { fromNode: CanvasNode; cursor: CanvasPoint } | null
/** Screen-space rectangle the user is dragging to select several nodes at once. */
export type MarqueeRect = CanvasRect | null

function localPoint(
  event: { clientX: number; clientY: number },
  element: HTMLElement
): CanvasPoint {
  const bounds = element.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

/** The floor in view: the rectangle and a drag only ever touch cards on it. */
function activeFloor(): CanvasLevelContents {
  const { document, activeLevelId } = getAgentCanvasState()
  return levelContents(document, activeLevelId) ?? document.root
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
        moveCanvasNodes(
          draggedPositions(gesture.origins, {
            x: world.x - gesture.grabWorld.x,
            y: world.y - gesture.grabWorld.y
          })
        )
      } else if (gesture.type === 'marquee') {
        // Why the start is re-projected: the box is drawn in screen space, and a wheel
        // pan during the drag moves where the world-anchored start now sits.
        const anchor = worldToScreen(gesture.startWorld, viewport)
        setMarquee(rectBetween(anchor, point))
      } else {
        setPendingWire({ fromNode: gesture.fromNode, cursor: point })
      }
    }
    const onUp = (event: PointerEvent): void => {
      const gesture = gestureRef.current
      gestureRef.current = null
      if (gesture?.type === 'marquee') {
        setMarquee(null)
        const end = localPoint(event, surface)
        const { viewport } = getAgentCanvasState()
        const anchor = worldToScreen(gesture.startWorld, viewport)
        const box = rectBetween(anchor, end)
        if (box.width < MARQUEE_MIN_PX && box.height < MARQUEE_MIN_PX) {
          // A click, not a drag: clearing is the intent, unless shift asked to keep it.
          if (!gesture.additive) {
            selectCanvasNode(null)
          }
          return
        }
        const hits = marqueeHits(
          activeFloor(),
          rectBetween(gesture.startWorld, screenToWorld(end, viewport))
        )
        selectCanvasNodes(combineSelection(gesture.before, hits, gesture.additive))
        return
      }
      if (gesture?.type !== 'wire') {
        return
      }
      setPendingWire(null)
      const { document, viewport } = getAgentCanvasState()
      const world = screenToWorld(localPoint(event, surface), viewport)
      // Draw order puts the topmost node last. Only the floor in view counts: a card
      // hidden on another floor must not catch a wire dropped where it would be.
      const onFloor = new Set(activeFloor().nodes.map((node) => node.id))
      const target = nodesCoveringPoint(document, world).findLast(
        (node) => node.id !== gesture.fromNode.id && onFloor.has(node.id)
      )
      if (target) {
        connectCanvasNodes(gesture.fromNode.id, target.id)
      }
    }
    // Why: wheel must be non-passive to stop the page scrolling under the canvas.
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const { viewport, floorOverview } = getAgentCanvasState()
      // Why: in the floor stack the wheel changes floors (use-floor-overview-keys); it
      // must never also pan the tilted board underneath.
      if (floorOverview) {
        return
      }
      if (event.ctrlKey || event.metaKey) {
        // Trackpad pinch arrives as ctrl+wheel with small deltas; scale proportionally.
        const step = Math.min(Math.abs(event.deltaY), 25)
        const zoom = nextZoomLevel(viewport.zoom, event.deltaY < 0 ? 1 : -1, step)
        setCanvasViewport(zoomAtPoint(viewport, zoom, localPoint(event, surface)))
        return
      }
      setCanvasViewport(panBy(viewport, { x: -event.deltaX, y: -event.deltaY }))
    }
    // Why: a cancelled pointer (alt-tab, touch interrupted) must not leave a
    // half-drawn rectangle or a card glued to the cursor.
    const onCancel = (): void => {
      gestureRef.current = null
      setMarquee(null)
      setPendingWire(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    surface.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
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
      // Why the reference does this too: a focused input (a note, a terminal) would
      // otherwise keep the keyboard, and the drag would select its text instead.
      if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
      ) {
        document.activeElement.blur()
      }
      event.preventDefault()
      const state = getAgentCanvasState()
      gestureRef.current = {
        type: 'marquee',
        start,
        startWorld: screenToWorld(start, state.viewport),
        additive: event.shiftKey,
        before: state.selectedNodeIds
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
      // Why a locked card swallows the gesture: the lock is there to keep a card
      // where it is, so dragging one would contradict the menu item that set it.
      if (node.locked === true) {
        return
      }
      event.stopPropagation()
      if (event.shiftKey) {
        toggleCanvasNodeSelection(node.id)
        return
      }
      const state = getAgentCanvasState()
      // Why the selection is kept: grabbing one of several selected cards moves them
      // all, as the reference does; grabbing an unselected card selects just it.
      const selected = state.selectedNodeIds.includes(node.id) ? state.selectedNodeIds : [node.id]
      if (selected.length === 1) {
        selectCanvasNode(node.id)
      }
      gestureRef.current = {
        type: 'drag',
        // Why the body is not used: dragging a card by its body would fight the
        // text caret, the live terminal and the portal frame inside it.
        grabWorld: screenToWorld(localPoint(event, surface), state.viewport),
        origins: dragSet(activeFloor(), node.id, selected),
        moved: false
      }
    },
    [surfaceRef]
  )

  const onPortPointerDown = React.useCallback(
    (event: React.PointerEvent, node: CanvasNode) => {
      const surface = surfaceRef.current
      if (!surface || event.button !== 0 || node.locked === true) {
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
