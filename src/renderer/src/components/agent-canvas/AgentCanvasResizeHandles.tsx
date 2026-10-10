import React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import { snapToGrid } from '../../../../shared/spatial-canvas/creation-frame'
import { resizeCanvasNode } from './agent-canvas-store'

const MIN_WIDTH = 160
const MIN_HEIGHT = 100

type Axis = 'x' | 'y' | 'xy'

const HANDLES: readonly { axis: Axis; className: string }[] = [
  { axis: 'x', className: 'right-0 top-3 bottom-3 w-1.5 cursor-ew-resize' },
  { axis: 'y', className: 'bottom-0 left-3 right-3 h-1.5 cursor-ns-resize' },
  { axis: 'xy', className: 'bottom-0 right-0 size-3.5 cursor-nwse-resize' }
]

/**
 * Edge and corner grips that resize a card. Why world units: the card is scaled
 * by the zoom transform, so a screen delta is divided by zoom before it lands.
 */
export function AgentCanvasResizeHandles(props: {
  node: CanvasNode
  zoom: number
}): React.JSX.Element | null {
  const start = React.useRef<{
    x: number
    y: number
    width: number
    height: number
    axis: Axis
  } | null>(null)
  if (props.node.locked === true) {
    return null
  }
  const label = translate('auto.components.agentCanvas.resizeCard', 'Drag to resize')
  return (
    <>
      {HANDLES.map(({ axis, className }) => (
        <div
          key={axis}
          role="separator"
          aria-label={label}
          title={label}
          className={cn('absolute z-10', className)}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return
            }
            event.stopPropagation()
            event.preventDefault()
            // Why capture: the pointer crosses iframes and live terminals while resizing.
            event.currentTarget.setPointerCapture(event.pointerId)
            start.current = {
              x: event.clientX,
              y: event.clientY,
              width: props.node.frame.width,
              height: props.node.frame.height,
              axis
            }
          }}
          onPointerMove={(event) => {
            const origin = start.current
            if (!origin) {
              return
            }
            const zoom = props.zoom > 0 ? props.zoom : 1
            const width =
              origin.axis === 'y'
                ? origin.width
                : Math.max(MIN_WIDTH, snapToGrid(origin.width + (event.clientX - origin.x) / zoom))
            const height =
              origin.axis === 'x'
                ? origin.height
                : Math.max(
                    MIN_HEIGHT,
                    snapToGrid(origin.height + (event.clientY - origin.y) / zoom)
                  )
            if (width !== props.node.frame.width || height !== props.node.frame.height) {
              resizeCanvasNode(props.node.id, { width, height })
            }
          }}
          onPointerUp={(event) => {
            start.current = null
            event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={() => {
            start.current = null
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        />
      ))}
    </>
  )
}
