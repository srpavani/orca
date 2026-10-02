import {
  addNode,
  createNode,
  emptyLevelContents,
  newCanvasId,
  type CanvasIdFactory
} from './document'
import { reconcileBridges } from './bridges'
import type { FloorLoadState } from './floor-lifecycle'
import { levelIdOfNode } from './levels'
import type {
  CanvasDocument,
  CanvasLevelId,
  CanvasNode,
  CanvasNodeId,
  CanvasPoint,
  CanvasShape
} from './types'

/** Adds a named level (a "floor"), optionally pinned to a git branch. */
export function createLevel(
  document: CanvasDocument,
  input: { name: string; branch?: string | null },
  id: CanvasIdFactory = newCanvasId
): { document: CanvasDocument; levelId: string } {
  const levelId = id()
  return {
    levelId,
    document: {
      ...document,
      levels: [
        ...document.levels,
        {
          id: levelId,
          name: input.name.trim() || 'Floor',
          branch: input.branch ?? null,
          ...emptyLevelContents()
        }
      ]
    }
  }
}

/** Records whether a floor's own checkout is loaded. Returns the same document when it already is. */
export function setLevelState(
  document: CanvasDocument,
  levelId: string,
  state: FloorLoadState
): CanvasDocument {
  const level = document.levels.find((candidate) => candidate.id === levelId)
  if (!level || (level.state ?? 'active') === state) {
    return document
  }
  return {
    ...document,
    levels: document.levels.map((candidate) =>
      candidate.id === levelId ? { ...candidate, state } : candidate
    )
  }
}

export function renameLevel(
  document: CanvasDocument,
  levelId: string,
  name: string
): CanvasDocument {
  const trimmed = name.trim()
  if (!trimmed) {
    return document
  }
  return {
    ...document,
    levels: document.levels.map((level) =>
      level.id === levelId ? { ...level, name: trimmed } : level
    )
  }
}

/**
 * Deletes a level and everything on it. Sessions placed there move back to the
 * ground level instead of vanishing, because removing a session node silently
 * revokes every wire that granted it access — that must stay a deliberate act.
 */
export function deleteLevel(document: CanvasDocument, levelId: string): CanvasDocument {
  const level = document.levels.find((candidate) => candidate.id === levelId)
  if (!level) {
    return document
  }
  const survivors = level.nodes.filter((node) => node.content.kind === 'session')
  const gone = new Set(
    level.nodes.filter((node) => node.content.kind !== 'session').map((node) => node.id)
  )
  // Why: a bridge whose marker lived here goes with the floor; bridges of rescued sessions
  // are re-homed (or dropped if both ends now share the ground) by reconcileBridges.
  return reconcileBridges({
    ...document,
    root: { ...document.root, nodes: [...document.root.nodes, ...survivors] },
    levels: document.levels.filter((candidate) => candidate.id !== levelId),
    bridges: document.bridges.filter((bridge) => !gone.has(bridge.bridgeNodeId))
  })
}

/** Moves a node to another level; its wires are dropped because edges never cross levels. */
export function moveNodeToLevel(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  targetLevelId: CanvasLevelId
): CanvasDocument {
  const from = levelIdOfNode(document, nodeId)
  if (from === targetLevelId) {
    return document
  }
  let moving: CanvasNode | null = null
  const strip = <T extends { nodes: CanvasNode[]; edges: CanvasDocument['root']['edges'] }>(
    contents: T
  ): T => {
    const node = contents.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) {
      return contents
    }
    moving = node
    return {
      ...contents,
      nodes: contents.nodes.filter((candidate) => candidate.id !== nodeId),
      edges: contents.edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId)
    }
  }
  const stripped: CanvasDocument = {
    ...document,
    root: strip(document.root),
    levels: document.levels.map((level) => strip(level))
  }
  if (moving === null) {
    return document
  }
  // Why: the node's bridges must follow it to its new floor, or be dropped if they now
  // join two sessions on the same floor (a plain wire is the right tool there).
  return reconcileBridges(addNode(stripped, moving, targetLevelId))
}

export function addDrawing(
  document: CanvasDocument,
  shape: CanvasShape,
  at: CanvasPoint,
  levelId: CanvasLevelId,
  id: CanvasIdFactory = newCanvasId
): { document: CanvasDocument; node: CanvasNode } {
  const size = shapeSize(shape)
  const node = createNode({ kind: 'drawing', shape }, { x: at.x, y: at.y, ...size }, id)
  return { node, document: addNode(document, { ...node, zIndex: -1 }, levelId) }
}

export function addPortal(
  document: CanvasDocument,
  url: string,
  at: CanvasPoint,
  levelId: CanvasLevelId,
  id: CanvasIdFactory = newCanvasId
): { document: CanvasDocument; node: CanvasNode } {
  const node = createNode(
    { kind: 'portal', portalId: id(), url },
    { x: at.x, y: at.y, ...(document.elementDefaults?.portalSize ?? { width: 520, height: 380 }) },
    id
  )
  return { node, document: addNode(document, node, levelId) }
}

function shapeSize(shape: CanvasShape): { width: number; height: number } {
  if (shape.type === 'rect' || shape.type === 'ellipse') {
    return { width: shape.width, height: shape.height }
  }
  const points = shape.type === 'arrow' ? [shape.from, shape.to] : shape.points
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys))
  }
}

/** Only http(s) pages may be embedded; anything else would run with app privileges. */
export function normalizePortalUrl(raw: string): string | null {
  const trimmed = raw.trim()
  // Why: "localhost:3000" also matches the scheme grammar, so only `scheme://` or a
  // known host-less scheme counts as explicit; everything else is a bare host.
  const explicit =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^(javascript|data|file|about|blob):/i.test(trimmed)
  const candidate = explicit ? trimmed : `https://${trimmed}`
  if (!trimmed) {
    return null
  }
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
