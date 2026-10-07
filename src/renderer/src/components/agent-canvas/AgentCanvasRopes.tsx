import React from 'react'
import { translate } from '@/i18n/i18n'
import type {
  CanvasEdge,
  CanvasNode,
  CanvasViewport
} from '../../../../shared/spatial-canvas/types'
import { useAgentCanvasRopes } from './use-agent-canvas-ropes'

type AgentCanvasRopesProps = {
  nodes: readonly CanvasNode[]
  edges: readonly CanvasEdge[]
  viewport: CanvasViewport
  /** In-progress wire: source node plus the cursor in screen space. */
  pending: { fromNode: CanvasNode; cursor: { x: number; y: number } } | null
  /** Whether a wire drapes around the cards; the board's appearance decides. */
  avoidNodes: boolean
  /** Orthogonal circuit routing instead of a hanging rope. */
  circuit: boolean
  /** Wires a message is crossing right now: the reference draws them in the accent. */
  activeEdgeIds?: readonly string[]
  onDisconnect: (edge: CanvasEdge) => void
}

const ROPE_COLOR = 'var(--color-canvas-rope)'
const ACTIVE_ROPE_COLOR = 'var(--color-canvas-accent)'
/** Maestri's rope dash: 8 on, 6 off, in screen pixels. */
const DASH = '8 6'
/** The reference's BASE_STROKE_WIDTH and ACTIVE_STROKE_WIDTH. */
const BASE_STROKE = 2
const ACTIVE_STROKE = 2.5

/**
 * The canvas wires. Ropes hang and swing (see useAgentCanvasRopes), draw in a
 * faint grey dash so they never compete with the cards, and turn the accent
 * colour while the user is dragging one. The cut affordance rides the rope's
 * midpoint and is positioned imperatively by the animation loop.
 */
export function AgentCanvasRopes(props: AgentCanvasRopesProps): React.JSX.Element {
  const { edges, viewport, pending } = props
  const svgRef = useAgentCanvasRopes({
    edges,
    nodes: props.nodes,
    viewport,
    pending,
    avoidNodes: props.avoidNodes,
    circuit: props.circuit
  })
  const transform = `translate(${-viewport.origin.x * viewport.zoom} ${-viewport.origin.y * viewport.zoom}) scale(${viewport.zoom})`
  return (
    <svg ref={svgRef} className="pointer-events-none absolute inset-0 size-full overflow-visible">
      <g transform={transform}>
        {edges.map((edge) => {
          const active = props.activeEdgeIds?.includes(edge.id) ?? false
          return (
            <g key={edge.id} data-rope-id={edge.id} data-rope-active={active ? '' : undefined}>
              <path
                data-rope-path=""
                fill="none"
                stroke={active ? ACTIVE_ROPE_COLOR : ROPE_COLOR}
                strokeWidth={active ? ACTIVE_STROKE : BASE_STROKE}
                strokeLinejoin="round"
                className="transition-[stroke,stroke-width] duration-200"
                strokeDasharray={DASH}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <g data-rope-cut="" className="pointer-events-auto cursor-pointer">
                <title>
                  {translate('auto.components.agentCanvas.cutWire', 'Disconnect (revokes access)')}
                </title>
                {/* Generous invisible target: the visible glyph is 16px at any zoom. */}
                <circle r={11} fill="transparent" onClick={() => props.onDisconnect(edge)} />
                <circle
                  r={8}
                  fill="var(--color-canvas-glass)"
                  stroke={ROPE_COLOR}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d="M -3 -3 L 3 3 M 3 -3 L -3 3"
                  stroke="var(--color-canvas-glass-text)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            </g>
          )
        })}
        <path
          data-rope-pending=""
          fill="none"
          stroke={ACTIVE_ROPE_COLOR}
          strokeWidth={BASE_STROKE * 1.2}
          strokeDasharray={DASH}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle data-rope-pending-tip="" visibility="hidden" fill={ACTIVE_ROPE_COLOR} />
      </g>
    </svg>
  )
}
