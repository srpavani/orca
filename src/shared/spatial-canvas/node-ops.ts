/**
 * Node operations behind the card's context menu.
 *
 * Every function here is a pure document edit, so the renderer's menu, the CLI
 * and the tests all go through the same rules — the menu never edits a document
 * by hand. The vocabulary is the reference's own: copy, paste, duplicate,
 * rename, disconnect, bring to front, send to back, tidy, align, lock.
 */

import type {
  CanvasDocument,
  CanvasLevelContents,
  CanvasLevelId,
  CanvasNode,
  CanvasNodeContent,
  CanvasNodeId,
  CanvasPoint
} from './types'

export type CanvasAlign = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'

/** The node and the level holding it. */
export function findCanvasNode(
  document: CanvasDocument,
  nodeId: CanvasNodeId
): { node: CanvasNode; levelId: CanvasLevelId } | null {
  const ground = document.root.nodes.find((node) => node.id === nodeId)
  if (ground) {
    return { node: ground, levelId: null }
  }
  for (const level of document.levels) {
    const node = level.nodes.find((candidate) => candidate.id === nodeId)
    if (node) {
      return { node, levelId: level.id }
    }
  }
  return null
}

export function mapCanvasLevel(
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

function mapNode(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  update: (node: CanvasNode) => CanvasNode
): CanvasDocument {
  const found = findCanvasNode(document, nodeId)
  if (!found) {
    return document
  }
  return mapCanvasLevel(document, found.levelId, (contents) => ({
    ...contents,
    nodes: contents.nodes.map((node) => (node.id === nodeId ? update(node) : node))
  }))
}

/** Selecting a card raises it above its neighbours, as clicking a window does. */
export function bringCanvasNodeToFront(
  document: CanvasDocument,
  nodeId: CanvasNodeId
): CanvasDocument {
  const found = findCanvasNode(document, nodeId)
  if (!found) {
    return document
  }
  const siblings = levelNodes(document, found.levelId)
  const top = siblings.reduce((highest, node) => Math.max(highest, node.zIndex), 0)
  return mapNode(document, nodeId, (node) => ({ ...node, zIndex: top + 1 }))
}

/** Sends a card behind every other card on its floor. */
export function sendCanvasNodeToBack(
  document: CanvasDocument,
  nodeId: CanvasNodeId
): CanvasDocument {
  const found = findCanvasNode(document, nodeId)
  if (!found) {
    return document
  }
  const siblings = levelNodes(document, found.levelId)
  const bottom = siblings.reduce(
    (lowest, node) => Math.min(lowest, node.zIndex),
    siblings[0]?.zIndex ?? 0
  )
  return mapNode(document, nodeId, (node) => ({ ...node, zIndex: bottom - 1 }))
}

function levelNodes(document: CanvasDocument, levelId: CanvasLevelId): readonly CanvasNode[] {
  if (levelId === null) {
    return document.root.nodes
  }
  return document.levels.find((level) => level.id === levelId)?.nodes ?? []
}

/**
 * Drops every wire touching the node without removing the card. The reference
 * calls this Disconnect, and it is how access is revoked for one node alone.
 */
export function disconnectCanvasNode(
  document: CanvasDocument,
  nodeId: CanvasNodeId
): CanvasDocument {
  const found = findCanvasNode(document, nodeId)
  if (!found) {
    return document
  }
  return mapCanvasLevel(document, found.levelId, (contents) => {
    const edges = contents.edges.filter(
      (edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId
    )
    const live = new Set(edges.map((edge) => edge.id))
    return {
      ...contents,
      edges,
      ties: contents.ties
        .map((tie) => ({ ...tie, edgeIds: tie.edgeIds.filter((id) => live.has(id)) }))
        .filter((tie) => tie.edgeIds.length > 0)
    }
  })
}

/**
 * The name a card shows. Sessions carry the canvas-only `name` (a pinned label
 * the terminal's own title cannot overwrite); notes and text blocks carry
 * `pinnedName`. Kinds with no name of their own are left alone.
 */
export function renameCanvasNode(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  name: string | null
): CanvasDocument {
  const trimmed = name?.trim() ?? ''
  const pinned = trimmed.length === 0 ? null : trimmed
  return mapNode(document, nodeId, (node) => {
    switch (node.content.kind) {
      case 'session':
        return { ...node, content: { ...node.content, name: pinned } }
      case 'note':
      case 'text':
        return { ...node, content: { ...node.content, pinnedName: pinned } }
      default:
        return node
    }
  })
}

/** True when this kind of card has a name the user can set. */
export function canvasNodeIsRenameable(node: CanvasNode): boolean {
  return (
    node.content.kind === 'session' || node.content.kind === 'note' || node.content.kind === 'text'
  )
}

/** Locks a card against dragging, wiring and selection. */
export function setCanvasNodeLocked(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  locked: boolean
): CanvasDocument {
  return mapNode(document, nodeId, (node) => ({ ...node, locked: locked ? true : undefined }))
}

export function canvasNodeLocked(node: CanvasNode): boolean {
  return node.locked === true
}

/**
 * Lays the given cards out in a grid, keeping their reading order. Cards that
 * are not part of the selection stay where they are.
 */
export function tidyCanvasNodes(
  document: CanvasDocument,
  nodeIds: readonly CanvasNodeId[]
): CanvasDocument {
  const found = nodeIds
    .map((nodeId) => findCanvasNode(document, nodeId))
    .filter((entry): entry is { node: CanvasNode; levelId: CanvasLevelId } => entry !== null)
  if (found.length < 2) {
    return document
  }
  const levelId = found[0].levelId
  const moving = found.filter((entry) => entry.levelId === levelId).map((entry) => entry.node)
  const sorted = [...moving].sort((left, right) =>
    left.frame.y === right.frame.y ? left.frame.x - right.frame.x : left.frame.y - right.frame.y
  )
  const origin = sorted.reduce(
    (corner, node) => ({
      x: Math.min(corner.x, node.frame.x),
      y: Math.min(corner.y, node.frame.y)
    }),
    { x: sorted[0].frame.x, y: sorted[0].frame.y }
  )
  const cellWidth = Math.max(...sorted.map((node) => node.frame.width)) + TIDY_GAP
  const cellHeight = Math.max(...sorted.map((node) => node.frame.height)) + TIDY_GAP
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)))
  const placed = new Map<CanvasNodeId, CanvasPoint>()
  sorted.forEach((node, index) => {
    placed.set(node.id, {
      x: origin.x + (index % columns) * cellWidth,
      y: origin.y + Math.floor(index / columns) * cellHeight
    })
  })
  return mapCanvasLevel(document, levelId, (contents) => ({
    ...contents,
    nodes: contents.nodes.map((node) => {
      const at = placed.get(node.id)
      return at ? { ...node, frame: { ...node.frame, x: at.x, y: at.y } } : node
    })
  }))
}

const TIDY_GAP = 40

/** Aligns cards on one edge, using their shared bounding box. */
export function alignCanvasNodes(
  document: CanvasDocument,
  nodeIds: readonly CanvasNodeId[],
  align: CanvasAlign
): CanvasDocument {
  const found = nodeIds
    .map((nodeId) => findCanvasNode(document, nodeId))
    .filter((entry): entry is { node: CanvasNode; levelId: CanvasLevelId } => entry !== null)
  if (found.length < 2 || found.some((entry) => entry.levelId !== found[0].levelId)) {
    return document
  }
  const nodes = found.map((entry) => entry.node)
  const left = Math.min(...nodes.map((node) => node.frame.x))
  const right = Math.max(...nodes.map((node) => node.frame.x + node.frame.width))
  const top = Math.min(...nodes.map((node) => node.frame.y))
  const bottom = Math.max(...nodes.map((node) => node.frame.y + node.frame.height))
  const moved = new Map<CanvasNodeId, { x?: number; y?: number }>()
  for (const node of nodes) {
    switch (align) {
      case 'left':
        moved.set(node.id, { x: left })
        break
      case 'right':
        moved.set(node.id, { x: right - node.frame.width })
        break
      case 'centerX':
        moved.set(node.id, { x: (left + right) / 2 - node.frame.width / 2 })
        break
      case 'top':
        moved.set(node.id, { y: top })
        break
      case 'bottom':
        moved.set(node.id, { y: bottom - node.frame.height })
        break
      case 'centerY':
        moved.set(node.id, { y: (top + bottom) / 2 - node.frame.height / 2 })
        break
    }
  }
  return mapCanvasLevel(document, found[0].levelId, (contents) => ({
    ...contents,
    nodes: contents.nodes.map((node) => {
      const patch = moved.get(node.id)
      return patch ? { ...node, frame: { ...node.frame, ...patch } } : node
    })
  }))
}

/** The body ids a card keeps text under: a note's or a text block's. */
export function bodyIdsOf(content: CanvasNodeContent): string[] {
  if (content.kind === 'note') {
    return [content.noteId]
  }
  return content.kind === 'text' ? [content.textId] : []
}

/** The note/text body ids a removal should drop from the snapshot. */
export function bodyIdsOfNode(node: CanvasNode): string[] {
  return bodyIdsOf(node.content)
}
