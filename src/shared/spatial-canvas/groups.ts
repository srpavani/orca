/**
 * Groups, as the reference keeps them (groupNodes / ungroupNodes / deleteGroup
 * / pruneOrphanGroups): a dashed frame around two or more cards on one floor,
 * with an optional name and colour. A card belongs to at most one group.
 */

import { contentBounds } from './geometry'
import { newCanvasId, type CanvasIdFactory } from './document'
import { findCanvasNode, mapCanvasLevel } from './node-ops'
import type {
  CanvasDocument,
  CanvasGroup,
  CanvasLevelContents,
  CanvasLevelId,
  CanvasNodeId,
  CanvasRect
} from './types'

/** World units the frame stands off its members; the reference's GROUP_CANVAS_PADDING. */
export const GROUP_PADDING = 16

/** Neutral is the empty token; the rest are the reference's sticky-note swatches. */
export const GROUP_COLORS = {
  yellow: '#FFF9C4',
  pink: '#F8BBD0',
  blue: '#BBDEFB',
  green: '#C8E6C9',
  orange: '#FFE0B2',
  purple: '#E1BEE7'
} as const
export type GroupColor = keyof typeof GROUP_COLORS | ''

/**
 * Drops groups left with fewer than two members on this floor, and member ids
 * that no longer name a card here. A group of one is not a group.
 */
export function pruneGroups(contents: CanvasLevelContents): CanvasLevelContents {
  const present = new Set(contents.nodes.map((node) => node.id))
  const groups = contents.groups
    .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => present.has(id)) }))
    .filter((group) => group.nodeIds.length >= 2)
  const same =
    groups.length === contents.groups.length &&
    groups.every((group, index) => group.nodeIds.length === contents.groups[index]?.nodeIds.length)
  return same ? contents : { ...contents, groups }
}

/** The single floor every listed card is on, or undefined if they span floors. */
function sharedLevel(
  document: CanvasDocument,
  nodeIds: readonly CanvasNodeId[]
): CanvasLevelId | undefined {
  let level: CanvasLevelId | undefined
  for (const nodeId of nodeIds) {
    const found = findCanvasNode(document, nodeId)
    if (!found) {
      continue
    }
    if (level !== undefined && level !== found.levelId) {
      return undefined
    }
    level = found.levelId
  }
  return level
}

/**
 * Groups the cards. Like the reference: when every grouped member already
 * shares one group, the others join it; when they come from different groups,
 * a fresh group takes them all. Fewer than two cards does nothing.
 */
export function groupCanvasNodes(
  document: CanvasDocument,
  nodeIds: readonly CanvasNodeId[],
  id: CanvasIdFactory = newCanvasId
): { document: CanvasDocument; groupId: string | null } {
  const levelId = sharedLevel(document, nodeIds)
  if (levelId === undefined) {
    return { document, groupId: null }
  }
  let groupId: string | null = null
  const next = mapCanvasLevel(document, levelId, (contents) => {
    const wanted = new Set(
      contents.nodes.filter((node) => nodeIds.includes(node.id)).map((node) => node.id)
    )
    if (wanted.size < 2) {
      return contents
    }
    const owners = new Set(
      contents.groups
        .filter((group) => group.nodeIds.some((member) => wanted.has(member)))
        .map((group) => group.id)
    )
    const reuse = owners.size === 1 ? [...owners][0] : undefined
    groupId = reuse ?? id()
    const target = groupId
    const groups: CanvasGroup[] = contents.groups.map((group) =>
      group.id === target
        ? { ...group, nodeIds: [...new Set([...group.nodeIds, ...wanted])] }
        : { ...group, nodeIds: group.nodeIds.filter((member) => !wanted.has(member)) }
    )
    if (reuse === undefined) {
      groups.push({ id: target, nodeIds: [...wanted], label: '', colorToken: '' })
    }
    return pruneGroups({ ...contents, groups })
  })
  return { document: groupId === null ? document : next, groupId }
}

/** Takes the cards out of whatever group holds them; groups left below two vanish. */
export function ungroupCanvasNodes(
  document: CanvasDocument,
  nodeIds: readonly CanvasNodeId[]
): CanvasDocument {
  const levelId = sharedLevel(document, nodeIds)
  if (levelId === undefined) {
    return document
  }
  const leaving = new Set(nodeIds)
  return mapCanvasLevel(document, levelId, (contents) => {
    if (!contents.groups.some((group) => group.nodeIds.some((member) => leaving.has(member)))) {
      return contents
    }
    return pruneGroups({
      ...contents,
      groups: contents.groups.map((group) => ({
        ...group,
        nodeIds: group.nodeIds.filter((member) => !leaving.has(member))
      }))
    })
  })
}

function mapGroup(
  document: CanvasDocument,
  levelId: CanvasLevelId,
  groupId: string,
  change: (group: CanvasGroup) => CanvasGroup
): CanvasDocument {
  return mapCanvasLevel(document, levelId, (contents) => ({
    ...contents,
    groups: contents.groups.map((group) => (group.id === groupId ? change(group) : group))
  }))
}

export function renameCanvasGroup(
  document: CanvasDocument,
  levelId: CanvasLevelId,
  groupId: string,
  label: string
): CanvasDocument {
  return mapGroup(document, levelId, groupId, (group) => ({ ...group, label: label.trim() }))
}

export function recolorCanvasGroup(
  document: CanvasDocument,
  levelId: CanvasLevelId,
  groupId: string,
  color: GroupColor
): CanvasDocument {
  return mapGroup(document, levelId, groupId, (group) => ({ ...group, colorToken: color }))
}

/** The group a card is in on its floor, if any. */
export function groupOfNode(
  contents: CanvasLevelContents,
  nodeId: CanvasNodeId
): CanvasGroup | null {
  return contents.groups.find((group) => group.nodeIds.includes(nodeId)) ?? null
}

/** The frame a group draws: its members' bounds, padded. Null when no member is here. */
export function groupFrame(contents: CanvasLevelContents, group: CanvasGroup): CanvasRect | null {
  const rects = contents.nodes
    .filter((node) => group.nodeIds.includes(node.id))
    .map((node) => node.frame)
  const bounds = contentBounds(rects)
  if (!bounds) {
    return null
  }
  return {
    x: bounds.x - GROUP_PADDING,
    y: bounds.y - GROUP_PADDING,
    width: bounds.width + GROUP_PADDING * 2,
    height: bounds.height + GROUP_PADDING * 2
  }
}

/** The swatch hex for a token, or null for neutral and anything unknown. */
export function groupColorHex(token: string): string | null {
  return token in GROUP_COLORS ? GROUP_COLORS[token as keyof typeof GROUP_COLORS] : null
}
