import type {
  CanvasDocument,
  CanvasEdge,
  CanvasLevelContents,
  CanvasLevelId,
  CanvasNode,
  CanvasNodeId
} from './types'

/** Ground level first, then every additional level — the canonical iteration order. */
export function levelsOf(
  document: CanvasDocument
): readonly { id: CanvasLevelId; name: string; contents: CanvasLevelContents }[] {
  return [
    { id: null, name: 'Ground', contents: document.root },
    ...document.levels.map((level) => ({ id: level.id, name: level.name, contents: level }))
  ]
}

export function levelContents(
  document: CanvasDocument,
  levelId: CanvasLevelId
): CanvasLevelContents | null {
  if (levelId === null) {
    return document.root
  }
  return document.levels.find((level) => level.id === levelId) ?? null
}

export function everyNode(document: CanvasDocument): readonly CanvasNode[] {
  return levelsOf(document).flatMap((level) => level.contents.nodes)
}

export function everyEdge(document: CanvasDocument): readonly CanvasEdge[] {
  return levelsOf(document).flatMap((level) => level.contents.edges)
}

export function findNode(document: CanvasDocument, nodeId: CanvasNodeId): CanvasNode | null {
  for (const level of levelsOf(document)) {
    const node = level.contents.nodes.find((candidate) => candidate.id === nodeId)
    if (node) {
      return node
    }
  }
  return null
}

export function levelIdOfNode(
  document: CanvasDocument,
  nodeId: CanvasNodeId
): CanvasLevelId | null {
  for (const level of levelsOf(document)) {
    if (level.contents.nodes.some((node) => node.id === nodeId)) {
      return level.id
    }
  }
  return null
}

/**
 * The node projecting a session. Sessions are addressed by session id on the
 * wire but by node id in the graph, so every lookup funnels through here.
 */
export function sessionNode(document: CanvasDocument, sessionId: string): CanvasNode | null {
  return (
    everyNode(document).find(
      (node) => node.content.kind === 'session' && node.content.sessionId === sessionId
    ) ?? null
  )
}

export function sessionIdOfNode(node: CanvasNode): string | null {
  return node.content.kind === 'session' ? node.content.sessionId : null
}

/** Notes reachable from a stack node, in page order, skipping dangling ids. */
export function stackMembers(document: CanvasDocument, node: CanvasNode): readonly CanvasNode[] {
  if (node.content.kind !== 'stack') {
    return []
  }
  const byId = new Map(everyNode(document).map((candidate) => [candidate.id, candidate]))
  return node.content.memberNodeIds.flatMap((id) => {
    const member = byId.get(id)
    return member ? [member] : []
  })
}

/**
 * Total draw order: level, then zIndex, then id so the result is stable across
 * runs when two nodes share a zIndex.
 */
export function nodesInDrawOrder(document: CanvasDocument): readonly CanvasNode[] {
  return everyNode(document)
    .slice()
    .sort((left, right) => {
      if (left.zIndex !== right.zIndex) {
        return left.zIndex - right.zIndex
      }
      return left.id < right.id ? -1 : 1
    })
}

export function nodesCoveringPoint(
  document: CanvasDocument,
  point: { x: number; y: number }
): readonly CanvasNode[] {
  return nodesInDrawOrder(document).filter(
    (node) =>
      point.x >= node.frame.x &&
      point.x <= node.frame.x + node.frame.width &&
      point.y >= node.frame.y &&
      point.y <= node.frame.y + node.frame.height
  )
}

export function nodesIntersectingRect(
  document: CanvasDocument,
  rect: { x: number; y: number; width: number; height: number }
): readonly CanvasNode[] {
  return everyNode(document).filter(
    (node) =>
      node.frame.x < rect.x + rect.width &&
      node.frame.x + node.frame.width > rect.x &&
      node.frame.y < rect.y + rect.height &&
      node.frame.y + node.frame.height > rect.y
  )
}
