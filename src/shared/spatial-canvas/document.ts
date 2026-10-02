import { createNonSecureContextUuid } from '../non-secure-context-uuid'
import { inferEdgeKind } from './edge-kind'
import type {
  CanvasDocument,
  CanvasEdge,
  CanvasEdgeId,
  CanvasEdgeKind,
  CanvasLevel,
  CanvasLevelContents,
  CanvasLevelId,
  CanvasNode,
  CanvasNodeContent,
  CanvasNodeId,
  CanvasNoteColor,
  CanvasPoint,
  CanvasRect
} from './types'

export const CANVAS_DOCUMENT_VERSION = 1

/** Injected so tests and replayed edits produce stable ids. */
export type CanvasIdFactory = () => string

export const newCanvasId: CanvasIdFactory = createNonSecureContextUuid

export const DEFAULT_NODE_SIZE = { width: 640, height: 400 } as const
export const DEFAULT_NOTE_SIZE = { width: 320, height: 260 } as const

export function emptyLevelContents(): CanvasLevelContents {
  return { nodes: [], edges: [], ties: [], groups: [] }
}

export function createDocument(): CanvasDocument {
  return { version: CANVAS_DOCUMENT_VERSION, root: emptyLevelContents(), levels: [], bridges: [] }
}

export function createNode(
  content: CanvasNodeContent,
  frame: CanvasRect,
  id: CanvasIdFactory = newCanvasId
): CanvasNode {
  return { id: id(), frame, zIndex: 0, content }
}

export function createSessionNode(input: {
  sessionId: string
  label: string
  at: CanvasPoint
  roleId?: string | null
  isLead?: boolean
  size?: { width: number; height: number }
  id?: CanvasIdFactory
}): CanvasNode {
  return createNode(
    {
      kind: 'session',
      sessionId: input.sessionId,
      label: input.label,
      roleId: input.roleId ?? null,
      isLead: input.isLead ?? false
    },
    {
      x: input.at.x,
      y: input.at.y,
      width: input.size?.width ?? DEFAULT_NODE_SIZE.width,
      height: input.size?.height ?? DEFAULT_NODE_SIZE.height
    },
    input.id
  )
}

export function createNoteNode(input: {
  noteId: string
  at: CanvasPoint
  pinnedName?: string | null
  readOnly?: boolean
  color?: CanvasNoteColor
  size?: { width: number; height: number }
  id?: CanvasIdFactory
}): CanvasNode {
  return createNode(
    {
      kind: 'note',
      noteId: input.noteId,
      pinnedName: input.pinnedName ?? null,
      readOnly: input.readOnly ?? false,
      ...(input.color ? { color: input.color } : {})
    },
    {
      x: input.at.x,
      y: input.at.y,
      width: input.size?.width ?? DEFAULT_NOTE_SIZE.width,
      height: input.size?.height ?? DEFAULT_NOTE_SIZE.height
    },
    input.id
  )
}

function withLevel(
  document: CanvasDocument,
  levelId: CanvasLevelId,
  update: (contents: CanvasLevelContents) => CanvasLevelContents
): CanvasDocument {
  if (levelId === null) {
    return { ...document, root: update(document.root) }
  }
  return {
    ...document,
    levels: document.levels.map((level) =>
      level.id === levelId ? { ...level, ...update(level) } : level
    )
  }
}

export function addNode(
  document: CanvasDocument,
  node: CanvasNode,
  levelId: CanvasLevelId = null
): CanvasDocument {
  return withLevel(document, levelId, (contents) => ({
    ...contents,
    nodes: [...contents.nodes, node]
  }))
}

export function patchNodeFrame(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  frame: Partial<CanvasRect>
): CanvasDocument {
  const levelId = levelIdOf(document, nodeId)
  return withLevel(document, levelId, (contents) => ({
    ...contents,
    nodes: contents.nodes.map((node) =>
      node.id === nodeId ? { ...node, frame: { ...node.frame, ...frame } } : node
    )
  }))
}

function levelIdOf(document: CanvasDocument, nodeId: CanvasNodeId): CanvasLevelId {
  if (document.root.nodes.some((node) => node.id === nodeId)) {
    return null
  }
  return document.levels.find((level) => level.nodes.some((node) => node.id === nodeId))?.id ?? null
}

/** Removes a node and every edge or bridge touching it, so no dangling wires remain. */
export function removeNode(document: CanvasDocument, nodeId: CanvasNodeId): CanvasDocument {
  const stripped = mapAllLevels(document, (contents) => {
    const edges = contents.edges.filter(
      (edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId
    )
    const liveEdgeIds = new Set(edges.map((edge) => edge.id))
    return {
      ...contents,
      nodes: contents.nodes.filter((node) => node.id !== nodeId),
      edges,
      ties: contents.ties
        .map((tie) => ({ ...tie, edgeIds: tie.edgeIds.filter((id) => liveEdgeIds.has(id)) }))
        .filter((tie) => tie.edgeIds.length > 0),
      groups: contents.groups.map((group) => ({
        ...group,
        nodeIds: group.nodeIds.filter((id) => id !== nodeId)
      }))
    }
  })
  return {
    ...stripped,
    bridges: stripped.bridges.filter(
      (bridge) =>
        bridge.fromNodeId !== nodeId && bridge.toNodeId !== nodeId && bridge.bridgeNodeId !== nodeId
    )
  }
}

export function createEdge(input: {
  kind: CanvasEdgeKind
  fromNodeId: CanvasNodeId
  toNodeId: CanvasNodeId
  createdAt: string
  ropePoints?: CanvasPoint[] | null
  id?: CanvasIdFactory
}): CanvasEdge {
  const id = (input.id ?? newCanvasId)()
  return {
    id,
    kind: input.kind,
    createdAt: input.createdAt,
    ropePoints: input.ropePoints ?? null,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId
  } as CanvasEdge
}

export function addEdge(
  document: CanvasDocument,
  edge: CanvasEdge,
  levelId: CanvasLevelId = null
): CanvasDocument {
  return withLevel(document, levelId, (contents) => ({
    ...contents,
    edges: [...contents.edges, edge]
  }))
}

/** Creates the edge joining two existing nodes, or null when the pair is invalid. */
export function connectNodes(
  document: CanvasDocument,
  fromNodeId: CanvasNodeId,
  toNodeId: CanvasNodeId,
  createdAt: string,
  id: CanvasIdFactory = newCanvasId
): { document: CanvasDocument; edge: CanvasEdge } | null {
  if (fromNodeId === toNodeId) {
    return null
  }
  // Why: a wire lives on its endpoints' floor; across floors only a bridge may grant access.
  const levelId = levelIdOf(document, fromNodeId)
  if (levelId !== levelIdOf(document, toNodeId)) {
    return null
  }
  const kind = inferEdgeKind(document, fromNodeId, toNodeId)
  if (kind === null) {
    return null
  }
  const duplicate = [...document.root.edges, ...document.levels.flatMap((l) => l.edges)].some(
    (edge) =>
      (edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId) ||
      (edge.fromNodeId === toNodeId && edge.toNodeId === fromNodeId)
  )
  if (duplicate) {
    return null
  }
  const edge = createEdge({ kind, fromNodeId, toNodeId, createdAt, id })
  return { document: addEdge(document, edge, levelId), edge }
}

/** Applies an update to the ground level and every other level, keeping level identity. */
function mapAllLevels(
  document: CanvasDocument,
  update: (contents: CanvasLevelContents) => CanvasLevelContents
): CanvasDocument {
  return {
    ...document,
    root: update(document.root),
    levels: document.levels.map((level) => ({ ...level, ...update(level) }))
  }
}

export function removeEdge(document: CanvasDocument, edgeId: CanvasEdgeId): CanvasDocument {
  return mapAllLevels(document, (contents) => ({
    ...contents,
    edges: contents.edges.filter((edge) => edge.id !== edgeId),
    ties: contents.ties.map((tie) => ({
      ...tie,
      edgeIds: tie.edgeIds.filter((id) => id !== edgeId)
    }))
  }))
}

export function setRopePoints(
  document: CanvasDocument,
  edgeId: CanvasEdgeId,
  ropePoints: CanvasPoint[] | null
): CanvasDocument {
  return mapAllLevels(document, (contents) => ({
    ...contents,
    edges: contents.edges.map((edge) => (edge.id === edgeId ? { ...edge, ropePoints } : edge))
  }))
}

/** Recolours a sticky note wherever it sits. Returns the same document when nothing changes. */
export function setNoteColor(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  color: CanvasNoteColor
): CanvasDocument {
  let changed = false
  const update = (contents: CanvasLevelContents): CanvasLevelContents => {
    const nodes = contents.nodes.map((node) => {
      if (node.id !== nodeId || node.content.kind !== 'note' || node.content.color === color) {
        return node
      }
      changed = true
      return { ...node, content: { ...node.content, color } }
    })
    return changed ? { ...contents, nodes } : contents
  }
  const next = mapAllLevels(document, update)
  return changed ? next : document
}

export function addLevel(document: CanvasDocument, level: CanvasLevel): CanvasDocument {
  return { ...document, levels: [...document.levels, level] }
}
