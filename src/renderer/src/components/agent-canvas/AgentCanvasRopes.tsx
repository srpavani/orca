import React from 'react'
import { X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { worldRectToScreen } from '../../../../shared/spatial-canvas/geometry'
import type {
  CanvasEdge,
  CanvasNode,
  CanvasPoint,
  CanvasViewport
} from '../../../../shared/spatial-canvas/types'
import { ropeBetween, ropeToPoint } from './agent-canvas-rope'

type AgentCanvasRopesProps = {
  nodes: readonly CanvasNode[]
  edges: readonly CanvasEdge[]
  viewport: CanvasViewport
  /** In-progress wire: source node plus the cursor in screen space. */
  pending: { fromNode: CanvasNode; cursor: CanvasPoint } | null
  onDisconnect: (edge: CanvasEdge) => void
}

export function AgentCanvasRopes(props: AgentCanvasRopesProps): React.JSX.Element {
  const { nodes, edges, viewport, pending } = props
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
        {edges.map((edge) => {
          const from = byId.get(edge.fromNodeId)
          const to = byId.get(edge.toNodeId)
          if (!from || !to) {
            return null
          }
          const rope = ropeBetween(
            worldRectToScreen(from.frame, viewport),
            worldRectToScreen(to.frame, viewport)
          )
          return (
            <path
              key={edge.id}
              d={rope.d}
              fill="none"
              className={
                edge.kind === 'session-session' ? 'stroke-primary' : 'stroke-annotation-highlight'
              }
              strokeWidth={2}
              strokeLinecap="round"
            />
          )
        })}
        {pending ? (
          <path
            d={ropeToPoint(worldRectToScreen(pending.fromNode.frame, viewport), pending.cursor).d}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        ) : null}
      </svg>
      {edges.map((edge) => {
        const from = byId.get(edge.fromNodeId)
        const to = byId.get(edge.toNodeId)
        if (!from || !to) {
          return null
        }
        const { mid } = ropeBetween(
          worldRectToScreen(from.frame, viewport),
          worldRectToScreen(to.frame, viewport)
        )
        return (
          <button
            key={`cut-${edge.id}`}
            type="button"
            className="absolute flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-60 hover:opacity-100 hover:text-destructive"
            style={{ left: mid.x, top: mid.y }}
            aria-label={translate(
              'auto.components.agentCanvas.cutWire',
              'Disconnect (revokes access)'
            )}
            title={translate('auto.components.agentCanvas.cutWire', 'Disconnect (revokes access)')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => props.onDisconnect(edge)}
          >
            <X className="size-2.5" />
          </button>
        )
      })}
    </>
  )
}
