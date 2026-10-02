import React from 'react'
import type {
  CanvasDrawingContent,
  CanvasNode,
  CanvasPoint,
  CanvasShape,
  CanvasViewport
} from '../../../../shared/spatial-canvas/types'
import { worldToScreen } from '../../../../shared/spatial-canvas/geometry'

type DrawingNode = CanvasNode & { content: CanvasDrawingContent }

export function isDrawingNode(node: CanvasNode): node is DrawingNode {
  return node.content.kind === 'drawing'
}

function shapePath(
  shape: CanvasShape,
  origin: CanvasPoint,
  viewport: CanvasViewport
): React.JSX.Element {
  const at = (point: CanvasPoint) =>
    worldToScreen({ x: origin.x + point.x, y: origin.y + point.y }, viewport)
  if (shape.type === 'rect' || shape.type === 'ellipse') {
    const corner = at({ x: 0, y: 0 })
    const width = shape.width * viewport.zoom
    const height = shape.height * viewport.zoom
    return shape.type === 'rect' ? (
      <rect x={corner.x} y={corner.y} width={width} height={height} rx={6} />
    ) : (
      <ellipse
        cx={corner.x + width / 2}
        cy={corner.y + height / 2}
        rx={width / 2}
        ry={height / 2}
      />
    )
  }
  if (shape.type === 'arrow') {
    const from = at(shape.from)
    const to = at(shape.to)
    return (
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#agent-canvas-arrowhead)" />
    )
  }
  const points = shape.points.map(at)
  return <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
}

/** Freehand marks, boxes and arrows the user sketches around agents; purely visual. */
export function AgentCanvasDrawings(props: {
  nodes: readonly CanvasNode[]
  viewport: CanvasViewport
  draft: CanvasShape | null
  draftOrigin: CanvasPoint | null
  selectedNodeId: string | null
  onSelect: (node: CanvasNode) => void
}): React.JSX.Element {
  const { viewport } = props
  return (
    <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
      <defs>
        <marker
          id="agent-canvas-arrowhead"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" className="fill-muted-foreground" />
        </marker>
      </defs>
      {props.nodes.filter(isDrawingNode).map((node) => (
        <g
          key={node.id}
          className={
            node.id === props.selectedNodeId
              ? 'pointer-events-auto cursor-pointer stroke-primary'
              : 'pointer-events-auto cursor-pointer stroke-muted-foreground'
          }
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          onPointerDown={(event) => {
            event.stopPropagation()
            props.onSelect(node)
          }}
        >
          {shapePath(node.content.shape, { x: node.frame.x, y: node.frame.y }, viewport)}
        </g>
      ))}
      {props.draft && props.draftOrigin ? (
        <g
          className="stroke-primary"
          fill="none"
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
        >
          {shapePath(props.draft, props.draftOrigin, viewport)}
        </g>
      ) : null}
    </svg>
  )
}
