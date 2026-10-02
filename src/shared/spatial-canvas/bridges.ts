import { addNode, createNode, newCanvasId, type CanvasIdFactory } from './document'
import { findNode, levelIdOfNode } from './levels'
import type { CanvasBridge, CanvasDocument, CanvasLevelId, CanvasNode, CanvasNodeId } from './types'

export type BridgeRefusal = 'same-level' | 'not-sessions' | 'duplicate' | 'missing'

const BRIDGE_SIZE = { width: 180, height: 44 } as const

/**
 * Joins two sessions on different floors. Wires never cross floors, so this is
 * the only way an agent on one branch's floor may ask an agent on another.
 * The grant is still exactly one hop, and a marker node is placed beside the
 * source session so the crossing is visible (and deletable) on that floor.
 */
export function bridgeSessions(
  document: CanvasDocument,
  fromNodeId: CanvasNodeId,
  toNodeId: CanvasNodeId,
  id: CanvasIdFactory = newCanvasId
): { document: CanvasDocument; bridge: CanvasBridge } | { refused: BridgeRefusal } {
  const from = findNode(document, fromNodeId)
  const to = findNode(document, toNodeId)
  if (!from || !to) {
    return { refused: 'missing' }
  }
  if (from.content.kind !== 'session' || to.content.kind !== 'session') {
    return { refused: 'not-sessions' }
  }
  const fromLevelId = levelIdOfNode(document, fromNodeId)
  const toLevelId = levelIdOfNode(document, toNodeId)
  if (fromLevelId === toLevelId) {
    return { refused: 'same-level' }
  }
  if (bridgeBetween(document, fromNodeId, toNodeId)) {
    return { refused: 'duplicate' }
  }
  const marker = createNode(
    { kind: 'bridge' },
    {
      x: from.frame.x + from.frame.width - BRIDGE_SIZE.width,
      y: from.frame.y - BRIDGE_SIZE.height - 12,
      ...BRIDGE_SIZE
    },
    id
  )
  const bridge: CanvasBridge = {
    id: id(),
    bridgeNodeId: marker.id,
    fromNodeId,
    toNodeId,
    fromLevelId,
    toLevelId
  }
  return {
    bridge,
    document: { ...addNode(document, marker, fromLevelId), bridges: [...document.bridges, bridge] }
  }
}

export function bridgeBetween(
  document: CanvasDocument,
  leftNodeId: CanvasNodeId,
  rightNodeId: CanvasNodeId
): CanvasBridge | null {
  return (
    document.bridges.find(
      (bridge) =>
        (bridge.fromNodeId === leftNodeId && bridge.toNodeId === rightNodeId) ||
        (bridge.fromNodeId === rightNodeId && bridge.toNodeId === leftNodeId)
    ) ?? null
  )
}

export function bridgeOfMarker(
  document: CanvasDocument,
  markerNodeId: CanvasNodeId
): CanvasBridge | null {
  return document.bridges.find((bridge) => bridge.bridgeNodeId === markerNodeId) ?? null
}

/** Bridges with an end on `levelId`, with the session at the far end resolved for display. */
export function bridgesTouchingLevel(
  document: CanvasDocument,
  levelId: CanvasLevelId
): readonly {
  bridge: CanvasBridge
  near: CanvasNode | null
  far: CanvasNode | null
  farLevelId: CanvasLevelId
}[] {
  return document.bridges
    .filter((bridge) => bridge.fromLevelId === levelId || bridge.toLevelId === levelId)
    .map((bridge) => {
      const nearIsFrom = bridge.fromLevelId === levelId
      return {
        bridge,
        near: findNode(document, nearIsFrom ? bridge.fromNodeId : bridge.toNodeId),
        far: findNode(document, nearIsFrom ? bridge.toNodeId : bridge.fromNodeId),
        farLevelId: nearIsFrom ? bridge.toLevelId : bridge.fromLevelId
      }
    })
}

/**
 * Bridges record the floors of their ends; a session moved to another floor
 * would otherwise keep a stale crossing (or a same-floor one). Drops bridges
 * whose ends no longer sit on different floors and refreshes the rest.
 */
export function reconcileBridges(document: CanvasDocument): CanvasDocument {
  let changed = false
  const bridges: CanvasBridge[] = []
  for (const bridge of document.bridges) {
    if (!findNode(document, bridge.fromNodeId) || !findNode(document, bridge.toNodeId)) {
      changed = true
      continue
    }
    const fromLevelId = levelIdOfNode(document, bridge.fromNodeId)
    const toLevelId = levelIdOfNode(document, bridge.toNodeId)
    if (fromLevelId === toLevelId) {
      changed = true
      continue
    }
    if (fromLevelId !== bridge.fromLevelId || toLevelId !== bridge.toLevelId) {
      changed = true
      bridges.push({ ...bridge, fromLevelId, toLevelId })
      continue
    }
    bridges.push(bridge)
  }
  if (!changed) {
    return document
  }
  const live = new Set(bridges.map((bridge) => bridge.bridgeNodeId))
  const dropMarker = (nodes: CanvasNode[]): CanvasNode[] =>
    nodes.filter((node) => node.content.kind !== 'bridge' || live.has(node.id))
  return {
    ...document,
    root: { ...document.root, nodes: dropMarker(document.root.nodes) },
    levels: document.levels.map((level) => ({ ...level, nodes: dropMarker(level.nodes) })),
    bridges
  }
}
