import {
  clampZoom,
  contentOutsideStage,
  fitCanvasViewport
} from '../../../../shared/spatial-canvas/geometry'
import type { CanvasRect, CanvasViewport } from '../../../../shared/spatial-canvas/types'
import { getAgentCanvasState, setCanvasViewport } from './agent-canvas-store'

type Stage = { width: number; height: number }

/** The reference's camera spring: visualDuration 0.35, bounce 0 — it glides and settles, never overshoots. */
const GLIDE_OMEGA = (Math.PI * 2) / 0.35
const GLIDE_REST = 0.0005

/** Critically damped spring progress at `seconds`, 0 → 1 without overshoot. */
export function glideProgress(seconds: number): number {
  const wt = GLIDE_OMEGA * seconds
  return 1 - (1 + wt) * Math.exp(-wt)
}

let frame: number | null = null

function stopGlide(): void {
  if (frame !== null) {
    cancelAnimationFrame(frame)
    frame = null
  }
}

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Glides the camera to `target`, like the reference's animateCamera: the stage
 * centre travels in world space while the zoom eases, so the view never swings
 * wide. Any direct pan or zoom during the glide takes over at once.
 */
export function glideCanvasViewport(target: CanvasViewport, stage: Stage): void {
  stopGlide()
  const start = getAgentCanvasState().viewport
  const targetZoom = clampZoom(target.zoom)
  if (reducedMotion() || stage.width <= 0 || stage.height <= 0) {
    setCanvasViewport({ origin: target.origin, zoom: targetZoom })
    return
  }
  const half = { x: stage.width / 2, y: stage.height / 2 }
  const from = { x: start.origin.x + half.x / start.zoom, y: start.origin.y + half.y / start.zoom }
  const to = { x: target.origin.x + half.x / targetZoom, y: target.origin.y + half.y / targetZoom }
  const began = performance.now()
  let written = start
  const step = (now: number): void => {
    // Why: a pan or zoom from the user since the last frame takes over the camera.
    if (getAgentCanvasState().viewport !== written) {
      frame = null
      return
    }
    const t = glideProgress((now - began) / 1000)
    if (1 - t < GLIDE_REST) {
      frame = null
      setCanvasViewport({ origin: target.origin, zoom: targetZoom })
      return
    }
    const zoom = start.zoom + (targetZoom - start.zoom) * t
    setCanvasViewport({
      zoom,
      origin: {
        x: from.x + (to.x - from.x) * t - half.x / zoom,
        y: from.y + (to.y - from.y) * t - half.y / zoom
      }
    })
    written = getAgentCanvasState().viewport
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}

/** Centres `rect` at the current zoom, as the reference does when it travels to a card. */
export function glideToCard(rect: CanvasRect, stage: Stage): void {
  const { zoom } = getAgentCanvasState().viewport
  glideCanvasViewport(
    {
      zoom,
      origin: {
        x: rect.x + rect.width / 2 - stage.width / 2 / zoom,
        y: rect.y + rect.height / 2 - stage.height / 2 / zoom
      }
    },
    stage
  )
}

/** Frames `rects` (40px margin, never past 100%), the reference's zoomToRect. */
export function glideToRects(rects: readonly CanvasRect[], stage: Stage): boolean {
  const fitted = fitCanvasViewport(rects, stage, 40)
  if (fitted === null) {
    return false
  }
  glideCanvasViewport({ ...fitted, zoom: Math.min(fitted.zoom, 1) }, stage)
  return true
}

let zoomedInto: { nodeId: string; previous: CanvasViewport } | null = null

/**
 * The reference's zoom toggle (Ctrl/⌘+\): fills the stage with one card, and the
 * same key on that card glides back to where the user was.
 */
export function toggleCardZoom(nodeId: string, rect: CanvasRect, stage: Stage): void {
  if (zoomedInto?.nodeId === nodeId) {
    const { previous } = zoomedInto
    zoomedInto = null
    glideCanvasViewport(previous, stage)
    return
  }
  zoomedInto = { nodeId, previous: getAgentCanvasState().viewport }
  glideToRects([rect], stage)
}

let stageElement: HTMLElement | null = null

/** The page binds its surface so keys and creation flows can glide without a ref. */
export function bindCanvasStage(element: HTMLElement | null): void {
  stageElement = element
}

export function canvasStageSize(): Stage {
  return stageElement
    ? { width: stageElement.clientWidth, height: stageElement.clientHeight }
    : { width: 0, height: 0 }
}

/** The reference's travelTo: a card created out of view is brought into it. */
export function revealCanvasCard(rect: CanvasRect): void {
  const stage = canvasStageSize()
  if (contentOutsideStage(getAgentCanvasState().viewport, stage, [rect])) {
    glideToCard(rect, stage)
  }
}
