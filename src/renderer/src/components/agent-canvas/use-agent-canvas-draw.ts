import React from 'react'
import { screenToWorld } from '../../../../shared/spatial-canvas/geometry'
import type { CanvasPoint, CanvasShape } from '../../../../shared/spatial-canvas/types'
import { addCanvasDrawing } from './agent-canvas-level-actions'
import { getAgentCanvasState, setCanvasViewState } from './agent-canvas-store'

type DrawTool = NonNullable<ReturnType<typeof getAgentCanvasState>['drawTool']>

/** Turns a drag from `start` to `end` (world space) into a shape relative to its own origin. */
export function shapeFromDrag(
  tool: DrawTool,
  start: CanvasPoint,
  end: CanvasPoint,
  trail: readonly CanvasPoint[]
): { origin: CanvasPoint; shape: CanvasShape } {
  if (tool === 'freehand') {
    const points = trail.length > 0 ? trail : [start, end]
    const origin = {
      x: Math.min(...points.map((point) => point.x)),
      y: Math.min(...points.map((point) => point.y))
    }
    return {
      origin,
      shape: {
        type: 'freehand',
        points: points.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }))
      }
    }
  }
  if (tool === 'arrow') {
    const origin = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) }
    return {
      origin,
      shape: {
        type: 'arrow',
        from: { x: start.x - origin.x, y: start.y - origin.y },
        to: { x: end.x - origin.x, y: end.y - origin.y }
      }
    }
  }
  const origin = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) }
  const width = Math.abs(end.x - start.x)
  const height = Math.abs(end.y - start.y)
  return {
    origin,
    shape:
      tool === 'rect'
        ? { type: 'rect', width, height, cornerRadius: 6 }
        : { type: 'ellipse', width, height }
  }
}

const MIN_DRAG = 4

/** Pointer handling while a draw tool is armed; returns null when no tool is armed. */
export function useAgentCanvasDraw(surfaceRef: React.RefObject<HTMLDivElement | null>): {
  draft: { origin: CanvasPoint; shape: CanvasShape } | null
  onPointerDown: (event: React.PointerEvent) => boolean
} {
  const [draft, setDraft] = React.useState<{ origin: CanvasPoint; shape: CanvasShape } | null>(null)

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent): boolean => {
      const tool = getAgentCanvasState().drawTool
      const surface = surfaceRef.current
      if (!tool || !surface || event.button !== 0) {
        return false
      }
      event.preventDefault()
      const bounds = surface.getBoundingClientRect()
      const toWorld = (clientX: number, clientY: number): CanvasPoint =>
        screenToWorld(
          { x: clientX - bounds.left, y: clientY - bounds.top },
          getAgentCanvasState().viewport
        )
      const start = toWorld(event.clientX, event.clientY)
      const trail: CanvasPoint[] = [start]
      let end = start
      const onMove = (move: PointerEvent): void => {
        end = toWorld(move.clientX, move.clientY)
        trail.push(end)
        setDraft(shapeFromDrag(tool, start, end, trail))
      }
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setDraft(null)
        const zoom = getAgentCanvasState().viewport.zoom
        if (Math.hypot(end.x - start.x, end.y - start.y) * zoom >= MIN_DRAG) {
          const result = shapeFromDrag(tool, start, end, trail)
          addCanvasDrawing(result.shape, result.origin)
        }
        // Why: shapes are one-shot like most whiteboards; freehand stays armed for strokes.
        if (tool !== 'freehand') {
          setCanvasViewState({ drawTool: null })
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return true
    },
    [surfaceRef]
  )

  return { draft, onPointerDown }
}
