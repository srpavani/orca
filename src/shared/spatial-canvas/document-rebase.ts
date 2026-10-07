import { addEdge, addLevel, addNode, mapAllLevels, removeEdge, removeNode } from './document'
import { everyEdge, everyNode, levelIdOfNode } from './levels'
import type { CanvasDocument, CanvasEdge, CanvasLevelId, CanvasNode } from './types'

const byId = <T extends { id: string }>(items: readonly T[]): Map<string, T> =>
  new Map(items.map((item) => [item.id, item]))

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

function levelIdOfEdge(document: CanvasDocument, edgeId: string): CanvasLevelId {
  if (document.root.edges.some((edge) => edge.id === edgeId)) {
    return null
  }
  return document.levels.find((level) => level.edges.some((edge) => edge.id === edgeId))?.id ?? null
}

function sessionCardIdNotIn(
  document: CanvasDocument,
  sessionId: string,
  known: ReadonlyMap<string, CanvasNode>
): string | null {
  const card = everyNode(document).find(
    (node) =>
      node.content.kind === 'session' && node.content.sessionId === sessionId && !known.has(node.id)
  )
  return card?.id ?? null
}

function replaceNode(document: CanvasDocument, node: CanvasNode): CanvasDocument {
  return mapAllLevels(document, (contents) => ({
    ...contents,
    nodes: contents.nodes.map((candidate) => (candidate.id === node.id ? node : candidate))
  }))
}

/**
 * Three-way merge for a renderer save that lost a revision race: replays what
 * the host changed since `base` (cards, wires, floors and bridges an agent added
 * or removed through the CLI) onto the user's `local` document.
 *
 * Why not "local wins": `recruit`, `connect`, `note create` and `dismiss` change
 * the document on the host; overwriting it erased the agent's card or wire while
 * the CLI had already reported success. Where both sides changed the same card,
 * the host's content and the local frame win.
 */
export function rebaseDocument(
  local: CanvasDocument,
  base: CanvasDocument,
  host: CanvasDocument
): CanvasDocument {
  let next = local
  const localLevelIds = new Set(local.levels.map((level) => level.id))
  const baseLevelIds = new Set(base.levels.map((level) => level.id))
  for (const level of host.levels) {
    if (!baseLevelIds.has(level.id) && !localLevelIds.has(level.id)) {
      next = addLevel(next, { ...level, nodes: [], edges: [], ties: [], groups: [] })
    }
  }

  const baseNodes = byId(everyNode(base))
  const hostNodes = byId(everyNode(host))
  for (const [id, hostNode] of hostNodes) {
    const baseNode = baseNodes.get(id)
    const localNode = everyNode(next).find((node) => node.id === id)
    if (baseNode === undefined) {
      if (localNode === undefined) {
        // Why: the sync may have filed its own card for a session the host just placed.
        const syncCopy =
          hostNode.content.kind === 'session'
            ? sessionCardIdNotIn(next, hostNode.content.sessionId, baseNodes)
            : null
        if (syncCopy !== null) {
          next = removeNode(next, syncCopy)
        }
        next = addNode(next, hostNode, levelIdOfNode(host, id))
      }
    } else if (localNode !== undefined && !same(baseNode, hostNode)) {
      // Why content from the host but the frame from local: the host changes what a
      // card is (a replaced session, a role); where it sits is the user's.
      next = replaceNode(
        next,
        same(baseNode, localNode)
          ? hostNode
          : {
              ...localNode,
              content: same(baseNode.content, hostNode.content)
                ? localNode.content
                : hostNode.content
            }
      )
    }
  }
  for (const id of baseNodes.keys()) {
    if (!hostNodes.has(id)) {
      next = removeNode(next, id)
    }
  }

  const baseEdges = byId(everyEdge(base))
  const hostEdges = byId(everyEdge(host))
  const nodeIds = new Set(everyNode(next).map((node) => node.id))
  const has = (edge: CanvasEdge): boolean =>
    nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId)
  for (const [id, edge] of hostEdges) {
    if (
      !baseEdges.has(id) &&
      has(edge) &&
      !everyEdge(next).some((candidate) => candidate.id === id)
    ) {
      next = addEdge(next, edge, levelIdOfEdge(host, id))
    }
  }
  for (const id of baseEdges.keys()) {
    if (!hostEdges.has(id)) {
      next = removeEdge(next, id)
    }
  }

  const baseBridges = new Set(base.bridges.map((bridge) => bridge.id))
  const hostBridges = new Set(host.bridges.map((bridge) => bridge.id))
  const added = host.bridges.filter(
    (bridge) =>
      !baseBridges.has(bridge.id) &&
      !next.bridges.some((candidate) => candidate.id === bridge.id) &&
      nodeIds.has(bridge.fromNodeId) &&
      nodeIds.has(bridge.toNodeId)
  )
  const bridges = [
    ...next.bridges.filter((bridge) => !baseBridges.has(bridge.id) || hostBridges.has(bridge.id)),
    ...added
  ]
  return bridges.length === next.bridges.length && added.length === 0 ? next : { ...next, bridges }
}
