import {
  groupCanvasNodes,
  recolorCanvasGroup,
  renameCanvasGroup,
  ungroupCanvasNodes,
  type GroupColor
} from '../../../../shared/spatial-canvas/groups'
import { findCanvasNode } from '../../../../shared/spatial-canvas/node-ops'
import {
  applyElementDefault,
  type ElementDefaultChoice
} from '../../../../shared/spatial-canvas/element-defaults'
import type { CanvasLevelId, CanvasNodeId } from '../../../../shared/spatial-canvas/types'
import { getAgentCanvasState, updateDocument } from './agent-canvas-store'

/** Groups the cards; returns the group id, or null when fewer than two could be grouped. */
export function groupNodes(nodeIds: readonly CanvasNodeId[]): string | null {
  let groupId: string | null = null
  updateDocument((document) => {
    const result = groupCanvasNodes(document, nodeIds)
    groupId = result.groupId
    return result.document
  })
  return groupId
}

export function ungroupNodes(nodeIds: readonly CanvasNodeId[]): void {
  updateDocument((document) => ungroupCanvasNodes(document, nodeIds))
}

export function renameGroup(levelId: CanvasLevelId, groupId: string, label: string): void {
  updateDocument((document) => renameCanvasGroup(document, levelId, groupId, label))
}

export function recolorGroup(levelId: CanvasLevelId, groupId: string, color: GroupColor): void {
  updateDocument((document) => recolorCanvasGroup(document, levelId, groupId, color))
}

/** Whether any of the cards sits in a group — the reference offers Ungroup only then. */
export function anyNodeGrouped(nodeIds: readonly CanvasNodeId[]): boolean {
  const { document } = getAgentCanvasState()
  return nodeIds.some((nodeId) => {
    const found = findCanvasNode(document, nodeId)
    if (!found) {
      return false
    }
    const contents =
      found.levelId === null
        ? document.root
        : document.levels.find((level) => level.id === found.levelId)
    return contents?.groups.some((group) => group.nodeIds.includes(nodeId)) ?? false
  })
}

/** Adopts a card's size or colour as the default for new cards of its kind. */
export function adoptElementDefault(choice: ElementDefaultChoice): void {
  updateDocument((document) => ({
    ...document,
    elementDefaults: applyElementDefault(document.elementDefaults ?? {}, choice)
  }))
}
