import React from 'react'
import { Map as MapIcon } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { nextZoomLevel } from '../../../../shared/spatial-canvas/geometry'
import { AgentCanvasGlassButton, AgentCanvasGlassToolbar } from './AgentCanvasGlass'

/** The reference's ScrubableValue range for the zoom: 10%–300% in 5% steps. */
const SCRUB = { min: 0.1, max: 3, step: 0.05, sensitivity: 4 } as const

function snappedValue(value: number): number {
  const snapped = Number((Math.round(value / SCRUB.step) * SCRUB.step).toFixed(10))
  return Math.min(SCRUB.max, Math.max(SCRUB.min, snapped))
}

/** The reference's MinusGlyph: a 12×2 rounded bar in a 20px box. */
function MinusGlyph(): React.JSX.Element {
  return (
    <span className="inline-flex size-5 items-center justify-center" aria-hidden>
      <span className="block h-0.5 w-3 rounded-full bg-current" />
    </span>
  )
}

/** The reference's PlusGlyph: two crossed 12×2 bars. */
function PlusGlyph(): React.JSX.Element {
  return (
    <span className="inline-flex size-5 items-center justify-center" aria-hidden>
      <span className="relative block size-3">
        <span className="absolute left-0 top-1/2 h-0.5 w-3 -translate-y-1/2 rounded-full bg-current" />
        <span className="absolute left-1/2 top-0 h-3 w-0.5 -translate-x-1/2 rounded-full bg-current" />
      </span>
    </span>
  )
}

/**
 * The reference's ScrubableValue around the percentage: drag sideways to zoom
 * (4px per 5%), arrow keys step, and a click — not a drag — resets to 100%.
 */
function ScrubbableZoom(props: {
  zoom: number
  onZoom: (zoom: number) => void
  onReset: () => void
}): React.JSX.Element {
  const drag = React.useRef<{
    pointerId: number
    startX: number
    start: number
    last: number
    dragging: boolean
  } | null>(null)
  const suppressClick = React.useRef(false)
  const percent = Math.round(props.zoom * 100)
  const label = translate('auto.components.agentCanvas.zoomLevel', 'Zoom level')
  return (
    <span
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={SCRUB.min}
      aria-valuemax={SCRUB.max}
      aria-valuenow={props.zoom}
      aria-valuetext={`${percent}%`}
      className="inline-flex cursor-ew-resize touch-none select-none rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) {
          return
        }
        suppressClick.current = false
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          start: props.zoom,
          last: props.zoom,
          dragging: false
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || current.pointerId !== event.pointerId) {
          return
        }
        const distance = event.clientX - current.startX
        if (!current.dragging && Math.abs(distance) < 2) {
          return
        }
        current.dragging = true
        const next = snappedValue(current.start + (distance / SCRUB.sensitivity) * SCRUB.step)
        if (next !== current.last) {
          current.last = next
          props.onZoom(next)
        }
        event.preventDefault()
      }}
      onPointerUp={(event) => {
        const current = drag.current
        if (!current || current.pointerId !== event.pointerId) {
          return
        }
        suppressClick.current = current.dragging
        drag.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        drag.current = null
        suppressClick.current = false
      }}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false
          event.preventDefault()
          return
        }
        props.onReset()
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          const delta = event.key === 'ArrowLeft' ? -SCRUB.step : SCRUB.step
          props.onZoom(snappedValue(props.zoom + delta))
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onReset()
        }
      }}
    >
      <span
        title={translate('auto.components.agentCanvas.zoomReset', 'Reset zoom')}
        className="min-w-[48px] rounded-full px-2 py-0.5 text-center font-mono text-[12px] font-medium tabular-nums text-foreground/85 hover:bg-foreground/10"
      >
        {percent}%
      </span>
    </span>
  )
}

/**
 * The reference's ZoomPill: zoom out, the scrubbable percentage, zoom in — a
 * glass toolbar of GlassButtons with the reference's bar glyphs. Each step
 * moves to the next of the reference's zoom stops.
 */
export function AgentCanvasZoomControl(props: {
  zoom: number
  onZoom: (zoom: number) => void
}): React.JSX.Element {
  return (
    <AgentCanvasGlassToolbar
      className="pointer-events-auto"
      role="group"
      aria-label={translate('auto.components.agentCanvas.zoomLevel', 'Zoom level')}
    >
      <AgentCanvasGlassButton
        label={translate('auto.components.agentCanvas.zoomOut', 'Zoom out')}
        onClick={() => props.onZoom(nextZoomLevel(props.zoom, -1, null))}
      >
        <MinusGlyph />
      </AgentCanvasGlassButton>
      <ScrubbableZoom zoom={props.zoom} onZoom={props.onZoom} onReset={() => props.onZoom(1)} />
      <AgentCanvasGlassButton
        label={translate('auto.components.agentCanvas.zoomIn', 'Zoom in')}
        onClick={() => props.onZoom(nextZoomLevel(props.zoom, 1, null))}
      >
        <PlusGlyph />
      </AgentCanvasGlassButton>
    </AgentCanvasGlassToolbar>
  )
}

/** The reference's MinimapButton: a one-button glass toolbar with the Map glyph. */
export function AgentCanvasMinimapButton(props: {
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <AgentCanvasGlassToolbar className="pointer-events-auto">
      <AgentCanvasGlassButton
        label={translate('auto.components.agentCanvas.minimap', 'Minimap')}
        active={props.open}
        onClick={props.onToggle}
      >
        <MapIcon className="size-5" />
      </AgentCanvasGlassButton>
    </AgentCanvasGlassToolbar>
  )
}
