import React from 'react'
import { X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  MINIMAP,
  minimapPoint,
  originForMinimapPoint,
  projectMinimap
} from '../../../../shared/spatial-canvas/minimap'
import type { CanvasNode, CanvasViewport } from '../../../../shared/spatial-canvas/types'
import { parseNoteColor } from './agent-canvas-note-paper'
import { getAgentCanvasState, setCanvasViewport } from './agent-canvas-store'

const NOTE_VAR: Record<string, string> = {
  yellow: 'var(--note-yellow)',
  pink: 'var(--note-pink)',
  blue: 'var(--note-blue)',
  green: 'var(--note-green)',
  orange: 'var(--note-orange)',
  purple: 'var(--note-purple)',
  white: 'var(--note-paper)',
  charcoal: 'var(--note-charcoal)',
  slate: 'var(--note-slate)',
  midnight: 'var(--note-midnight)'
}

/** The reference's nodeFill: notes in their paper at 80%, everything else accent. */
function nodeFill(node: CanvasNode): { color: string; opacity: number } {
  if (node.content.kind === 'note') {
    const color = parseNoteColor(node.content.color) ?? 'yellow'
    return { color: NOTE_VAR[color] ?? NOTE_VAR.yellow, opacity: 0.8 }
  }
  return { color: 'var(--canvas-accent)', opacity: 1 }
}

/**
 * The reference's MinimapPanel: a 200×150 strong-glass panel above the zoom
 * pill. Cards are dots in their colour, the view is an accent frame; press or
 * drag inside to move the view there, arrows nudge it by a fifth of a screen.
 * A click outside or Escape closes it.
 */
export function AgentCanvasMinimap(props: {
  cards: readonly CanvasNode[]
  viewport: CanvasViewport
  stage: { width: number; height: number }
  onClose: () => void
}): React.JSX.Element {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const surfaceRef = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef(false)
  const projection = projectMinimap(
    props.cards.map((node) => node.frame),
    props.viewport,
    props.stage
  )
  const view = minimapPoint(projection, props.viewport.origin)
  const { onClose } = props

  React.useEffect(() => {
    const onDocClick = (event: MouseEvent): void => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) {
        return
      }
      onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    // Why deferred: the click that opened the panel must not close it.
    const timer = window.setTimeout(() => {
      document.addEventListener('click', onDocClick)
      document.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const jumpTo = (clientX: number, clientY: number): void => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) {
      return
    }
    const local = {
      x: Math.min(rect.width, Math.max(0, clientX - rect.left)),
      y: Math.min(rect.height, Math.max(0, clientY - rect.top))
    }
    const viewport = getAgentCanvasState().viewport
    setCanvasViewport({
      zoom: viewport.zoom,
      origin: originForMinimapPoint(projection, local, viewport, props.stage)
    })
  }
  const label = translate('auto.components.agentCanvas.minimap', 'Minimap')
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      data-canvas-chrome=""
      className="canvas-glass-strong pointer-events-auto absolute bottom-[60px] right-3 z-40 rounded-2xl p-1.5 shadow-2xl"
      style={{ width: MINIMAP.width, height: MINIMAP.height }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={translate('auto.components.agentCanvas.closeMinimap', 'Close minimap')}
        className="absolute right-2.5 top-2.5 z-10 flex size-5 items-center justify-center rounded-full bg-popover text-muted-foreground shadow-sm hover:text-foreground"
        onClick={onClose}
      >
        <X className="size-3" aria-hidden />
      </button>
      <div
        ref={surfaceRef}
        role="button"
        tabIndex={0}
        aria-label={label}
        className="relative size-full touch-none overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-canvas-accent"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return
          }
          event.preventDefault()
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          jumpTo(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if (dragging.current) {
            jumpTo(event.clientX, event.clientY)
          }
        }}
        onPointerUp={(event) => {
          dragging.current = false
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onKeyDown={(event) => {
          const { visible } = projection
          const step = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1]
          }[event.key]
          if (!step) {
            return
          }
          event.preventDefault()
          const viewport = getAgentCanvasState().viewport
          setCanvasViewport({
            zoom: viewport.zoom,
            origin: {
              x: viewport.origin.x + step[0] * visible.width * MINIMAP.keyNudge,
              y: viewport.origin.y + step[1] * visible.height * MINIMAP.keyNudge
            }
          })
        }}
      >
        {props.cards.map((node) => {
          const origin = minimapPoint(projection, node.frame)
          const fill = nodeFill(node)
          return (
            <div
              key={node.id}
              aria-hidden
              className="absolute rounded-[1px]"
              style={{
                left: origin.x,
                top: origin.y,
                width: Math.max(MINIMAP.minNodeDot, node.frame.width * projection.scale),
                height: Math.max(MINIMAP.minNodeDot, node.frame.height * projection.scale),
                backgroundColor: fill.color,
                opacity: fill.opacity
              }}
            />
          )
        })}
        <div
          aria-hidden
          data-minimap-view=""
          className="absolute rounded-[3px] border-[1.5px] border-canvas-accent"
          style={{
            left: view.x,
            top: view.y,
            width: projection.visible.width * projection.scale,
            height: projection.visible.height * projection.scale,
            backgroundColor: 'color-mix(in srgb, var(--canvas-accent) 8%, transparent)'
          }}
        />
      </div>
    </div>
  )
}
