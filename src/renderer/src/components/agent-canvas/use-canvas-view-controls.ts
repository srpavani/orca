import React from 'react'
import {
  contentOutsideStage,
  fitCanvasViewport,
  nextZoomLevel,
  zoomAtPoint
} from '../../../../shared/spatial-canvas/geometry'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import { getAgentCanvasState, setCanvasViewport } from './agent-canvas-store'
import { glideCanvasViewport } from './agent-canvas-camera'

type ViewControls = {
  /** Zoom one step, keeping the stage's centre still. */
  zoomBy: (direction: 1 | -1) => void
  /** Zoom to an exact level (the pill's scrub and its reset to 100%), centre still. */
  zoomTo: (zoom: number) => void
  /** Frame every card on the floor. */
  fitView: () => void
}

function stageSizeOf(surface: HTMLDivElement | null): { width: number; height: number } {
  return surface
    ? { width: surface.clientWidth, height: surface.clientHeight }
    : { width: 0, height: 0 }
}

/**
 * The board's viewport controls, plus the fit that keeps the board honest.
 *
 * Why the fit: a viewport saved against a different layout — or a card placed
 * outside the one on screen — leaves the canvas looking empty while the document
 * is full. It frames the cards only when the set of them changes and none is in
 * view, so it never yanks the view back from someone who panned away on purpose.
 */
export function useCanvasViewControls(input: {
  surfaceRef: React.RefObject<HTMLDivElement | null>
  cards: readonly CanvasNode[]
  loaded: boolean
}): ViewControls {
  const latest = React.useRef(input)
  latest.current = input

  const fitView = (): void => {
    const fitted = fitCanvasViewport(
      latest.current.cards.map((node) => node.frame),
      stageSizeOf(latest.current.surfaceRef.current)
    )
    if (fitted) {
      glideCanvasViewport(fitted, stageSizeOf(latest.current.surfaceRef.current))
    }
  }

  // The reference's zoomFromViewportCenter: every pill zoom keeps the stage centre still.
  const zoomTo = (zoom: number): void => {
    const stage = stageSizeOf(latest.current.surfaceRef.current)
    const centre = { x: stage.width / 2, y: stage.height / 2 }
    setCanvasViewport(zoomAtPoint(getAgentCanvasState().viewport, zoom, centre))
  }

  // Why a glide only for the steps: the pill's scrub must track the pointer exactly.
  const zoomBy = (direction: 1 | -1): void => {
    const stage = stageSizeOf(latest.current.surfaceRef.current)
    const viewport = getAgentCanvasState().viewport
    const zoom = nextZoomLevel(viewport.zoom, direction, null)
    glideCanvasViewport(
      zoomAtPoint(viewport, zoom, { x: stage.width / 2, y: stage.height / 2 }),
      stage
    )
  }

  const signature = input.cards.map((node) => node.id).join(',')
  const framedSignature = React.useRef<string | null>(null)
  React.useEffect(() => {
    const { cards, loaded, surfaceRef } = latest.current
    if (!loaded || signature === framedSignature.current) {
      return
    }
    framedSignature.current = signature
    const stage = stageSizeOf(surfaceRef.current)
    const frames = cards.map((node) => node.frame)
    if (cards.length === 0 || !contentOutsideStage(getAgentCanvasState().viewport, stage, frames)) {
      return
    }
    const fitted = fitCanvasViewport(frames, stage)
    if (fitted) {
      setCanvasViewport(fitted)
    }
  }, [input.loaded, signature])

  return { zoomBy, zoomTo, fitView }
}
