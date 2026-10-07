import React from 'react'
import {
  ROPE_FIXED_DT,
  ROPE_MAX_SUBSTEPS,
  closestEdgeMidpoint,
  createRope,
  repinRope,
  ropeEndpoints,
  ropePath,
  ropeMidpoint,
  settleRope,
  stepRope,
  type Rope,
  type RopeObstacle
} from '../../../../shared/spatial-canvas/rope-physics'
import { circuitPath } from '../../../../shared/spatial-canvas/canvas-appearance'
import type {
  CanvasEdge,
  CanvasNode,
  CanvasPoint,
  CanvasViewport
} from '../../../../shared/spatial-canvas/types'

type RopeInput = {
  edges: readonly CanvasEdge[]
  nodes: readonly CanvasNode[]
  viewport: CanvasViewport
  /** In-progress wire: its source node and the cursor in screen space. */
  pending: { fromNode: CanvasNode; cursor: CanvasPoint } | null
  /** Whether a wire drapes around the cards or is allowed to pass under them. */
  avoidNodes: boolean
  /** Orthogonal routing (the circuit style) instead of a hanging rope. */
  circuit: boolean
}

type RopeParts = { path: SVGPathElement | null; cut: SVGGElement | null }

function screenToWorld(point: CanvasPoint, viewport: CanvasViewport): CanvasPoint {
  return {
    x: viewport.origin.x + point.x / viewport.zoom,
    y: viewport.origin.y + point.y / viewport.zoom
  }
}

/**
 * Animates the canvas ropes. A rope is a physics chain, so it must be stepped
 * every frame; running that through React state would re-render the whole
 * canvas sixty times a second. This hook owns one requestAnimationFrame loop
 * that writes `d` and `transform` straight onto SVG nodes React already
 * rendered, and leaves React in charge of which ropes exist.
 */
export function useAgentCanvasRopes(input: RopeInput): React.RefObject<SVGSVGElement | null> {
  const svgRef = React.useRef<SVGSVGElement | null>(null)
  const ropes = React.useRef(new Map<string, Rope>())
  const obstacles = React.useRef(new Map<string, RopeObstacle[]>())
  const parts = React.useRef(new Map<string, RopeParts>())

  const latest = React.useRef(input)
  latest.current = input

  React.useEffect(() => {
    syncRopes(
      ropes.current,
      obstacles.current,
      parts.current,
      input.edges,
      input.nodes,
      input.avoidNodes
    )
    paint(svgRef.current, ropes.current, parts.current, latest.current)
  }, [input.edges, input.nodes, input.avoidNodes])

  React.useEffect(() => {
    paint(svgRef.current, ropes.current, parts.current, latest.current)
  }, [input.pending, input.viewport])

  React.useEffect(() => {
    let frame = 0
    let last = performance.now()
    let carry = 0
    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick)
      const elapsed = Math.min((now - last) / 1000, ROPE_FIXED_DT * ROPE_MAX_SUBSTEPS)
      last = now
      carry += elapsed
      let moving = false
      let steps = 0
      while (carry >= ROPE_FIXED_DT && steps < ROPE_MAX_SUBSTEPS) {
        carry -= ROPE_FIXED_DT
        steps += 1
        moving = stepAll(ropes.current, obstacles.current, latest.current) || moving
      }
      if (moving) {
        paint(svgRef.current, ropes.current, parts.current, latest.current)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return svgRef
}

function obstacleList(nodes: readonly CanvasNode[], exclude: readonly string[]): RopeObstacle[] {
  return nodes
    .filter((node) => node.content.kind !== 'drawing' && !exclude.includes(node.id))
    .map((node) => node.frame)
}

function anchorsFor(
  edge: CanvasEdge,
  byId: ReadonlyMap<string, CanvasNode>
): { start: CanvasPoint; end: CanvasPoint } | null {
  const from = byId.get(edge.fromNodeId)
  const to = byId.get(edge.toNodeId)
  return from && to ? ropeEndpoints(from.frame, to.frame) : null
}

/** How recent a wire must be to be born sagged and drop: just made, not loaded. */
const FRESH_EDGE_MS = 4000

/**
 * Why by age: the ropes already on the board when it opens are hung at rest;
 * only a wire the user just made is born in the reference's parabola and
 * swings into place.
 */
function isFreshEdge(edge: CanvasEdge): boolean {
  const age = Date.now() - Date.parse(edge.createdAt)
  return Number.isFinite(age) && age >= 0 && age < FRESH_EDGE_MS
}

/** Creates, drops and re-anchors ropes to match the rendered edges. */
function syncRopes(
  ropes: Map<string, Rope>,
  obstacles: Map<string, RopeObstacle[]>,
  parts: Map<string, RopeParts>,
  edges: readonly CanvasEdge[],
  nodes: readonly CanvasNode[],
  avoidNodes: boolean
): void {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const live = new Set<string>()
  for (const edge of edges) {
    const anchors = anchorsFor(edge, byId)
    if (!anchors) {
      continue
    }
    live.add(edge.id)
    // Why empty rather than absent: the physics loop reads this map every step, and
    // routing through is the same simulation with nothing in the way.
    obstacles.set(edge.id, avoidNodes ? obstacleList(nodes, [edge.fromNodeId, edge.toNodeId]) : [])
    const existing = ropes.get(edge.id)
    if (existing) {
      repinRope(existing, anchors.start, anchors.end)
      continue
    }
    // The connect animation: a new wire starts sagged and swings to rest under the
    // physics loop, exactly as the reference wakes a rope with no saved points.
    ropes.set(
      edge.id,
      isFreshEdge(edge)
        ? createRope(anchors.start, anchors.end, true)
        : settleRope(createRope(anchors.start, anchors.end), obstacles.get(edge.id) ?? [])
    )
  }
  for (const id of ropes.keys()) {
    if (!live.has(id)) {
      ropes.delete(id)
      obstacles.delete(id)
      parts.delete(id)
    }
  }
}

function stepAll(
  ropes: Map<string, Rope>,
  obstacles: Map<string, RopeObstacle[]>,
  input: RopeInput
): boolean {
  const byId = new Map(input.nodes.map((node) => [node.id, node]))
  let moving = false
  for (const edge of input.edges) {
    const rope = ropes.get(edge.id)
    const anchors = rope ? anchorsFor(edge, byId) : null
    if (!rope || !anchors) {
      continue
    }
    repinRope(rope, anchors.start, anchors.end)
    if (stepRope(rope, obstacles.get(edge.id) ?? [])) {
      moving = true
    }
  }
  return moving
}

function paintParts(svg: SVGSVGElement, edgeId: string, cache: Map<string, RopeParts>): RopeParts {
  const cached = cache.get(edgeId)
  if (cached?.path?.isConnected) {
    return cached
  }
  const group = svg.querySelector<SVGGElement>(`[data-rope-id="${edgeId}"]`)
  const found: RopeParts = {
    path: group?.querySelector<SVGPathElement>('[data-rope-path]') ?? null,
    cut: group?.querySelector<SVGGElement>('[data-rope-cut]') ?? null
  }
  cache.set(edgeId, found)
  return found
}

function paint(
  svg: SVGSVGElement | null,
  ropes: Map<string, Rope>,
  parts: Map<string, RopeParts>,
  input: RopeInput
): void {
  if (!svg) {
    return
  }
  const inverseZoom = 1 / input.viewport.zoom
  for (const [edgeId, rope] of ropes) {
    const { path, cut } = paintParts(svg, edgeId, parts)
    // Why the appearance decides the shape: the reference offers a rope that drapes
    // and a circuit-board trace; both are the same simulation, redrawn.
    path?.setAttribute('d', input.circuit ? circuitPath(rope.points) : ropePath(rope.points))
    const mid = ropeMidpoint(rope.points)
    cut?.setAttribute('transform', `translate(${mid.x} ${mid.y}) scale(${inverseZoom})`)
  }
  // The reference's connect preview: a straight accent dash from the source's
  // nearest side midpoint to the cursor, with a 3px dot riding the tip.
  const pendingPath = svg.querySelector('[data-rope-pending]')
  const tip = svg.querySelector('[data-rope-pending-tip]')
  const source = input.pending
  if (!source) {
    pendingPath?.setAttribute('d', '')
    tip?.setAttribute('visibility', 'hidden')
    return
  }
  const end = screenToWorld(source.cursor, input.viewport)
  const start = closestEdgeMidpoint(source.fromNode.frame, end)
  pendingPath?.setAttribute('d', `M ${start.x} ${start.y} L ${end.x} ${end.y}`)
  tip?.setAttribute('cx', String(end.x))
  tip?.setAttribute('cy', String(end.y))
  tip?.setAttribute('r', String(3 * inverseZoom))
  tip?.setAttribute('visibility', 'visible')
}
