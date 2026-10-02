/**
 * What the card menu does, in one place.
 *
 * The menu itself is presentation; every edit it can make lives here so the same
 * operations are reachable from the CLI and the tests. Clipboard contents are
 * module state rather than document state: a copy is a gesture, not something to
 * persist into the board the user shares with their agents.
 */

import { addNode, createTextNode, newCanvasId } from '../../../../shared/spatial-canvas/document'
import {
  alignCanvasNodes,
  bringCanvasNodeToFront,
  canvasNodeIsRenameable,
  disconnectCanvasNode,
  findCanvasNode,
  renameCanvasNode,
  sendCanvasNodeToBack,
  setCanvasNodeLocked,
  tidyCanvasNodes,
  type CanvasAlign
} from '../../../../shared/spatial-canvas/node-ops'
import {
  copyCanvasNodes,
  pasteCanvasClipboard,
  type CanvasClipboard
} from '../../../../shared/spatial-canvas/node-clipboard'
import type { CanvasNodeId, CanvasPoint } from '../../../../shared/spatial-canvas/types'
import {
  getAgentCanvasState,
  selectCanvasNodes,
  updateDocument,
  writeCanvasNote
} from './agent-canvas-store'

/** Offset a duplicated card by, so it lands next to the original, not on it. */
const DUPLICATE_OFFSET = 32

let clipboard: CanvasClipboard | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeCanvasClipboard(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function canvasClipboard(): CanvasClipboard | null {
  return clipboard
}

/** The ids a menu action should apply to: the whole selection, or just this card. */
export function canvasActionTargets(nodeId: CanvasNodeId): CanvasNodeId[] {
  const { selectedNodeIds } = getAgentCanvasState()
  return selectedNodeIds.includes(nodeId) && selectedNodeIds.length > 1
    ? [...selectedNodeIds]
    : [nodeId]
}

/** Copies cards, and their text, into the canvas clipboard. Returns how many. */
export function copyCanvasSelection(nodeIds: readonly CanvasNodeId[]): number {
  const { document, notes } = getAgentCanvasState()
  clipboard = copyCanvasNodes(document, nodeIds, notes)
  emit()
  return clipboard?.entries.length ?? 0
}

export function clearCanvasClipboard(): void {
  clipboard = null
  emit()
}

/** Pastes the clipboard as new cards on the floor being viewed, selecting them. */
export function pasteCanvasClipboardAt(at: CanvasPoint): CanvasNodeId[] {
  if (!clipboard) {
    return []
  }
  const { document, activeLevelId } = getAgentCanvasState()
  const pasted = pasteCanvasClipboard({ document, clipboard, at, levelId: activeLevelId })
  if (!pasted) {
    return []
  }
  updateDocument(() => pasted.document)
  for (const [bodyId, body] of Object.entries(pasted.bodies)) {
    writeCanvasNote(bodyId, body)
  }
  selectCanvasNodes(pasted.nodeIds)
  return pasted.nodeIds
}

/** Adds a text block, with an empty body, to the floor being viewed. */
export function addCanvasText(at: CanvasPoint): CanvasNodeId {
  const { activeLevelId } = getAgentCanvasState()
  const node = createTextNode({ textId: newCanvasId(), at })
  updateDocument((document) => addNode(document, node, activeLevelId))
  writeCanvasNote(node.content.kind === 'text' ? node.content.textId : '', '')
  selectCanvasNodes([node.id])
  return node.id
}

/** Copies a card and pastes the copy beside it. Null for kinds that cannot copy. */
export function duplicateCanvasNode(nodeId: CanvasNodeId): CanvasNodeId | null {
  const { document, notes } = getAgentCanvasState()
  const found = findCanvasNode(document, nodeId)
  if (!found) {
    return null
  }
  const single = copyCanvasNodes(document, [nodeId], notes)
  if (!single) {
    return null
  }
  const pasted = pasteCanvasClipboard({
    document,
    clipboard: single,
    at: { x: found.node.frame.x + DUPLICATE_OFFSET, y: found.node.frame.y + DUPLICATE_OFFSET },
    levelId: found.levelId
  })
  if (!pasted) {
    return null
  }
  updateDocument(() => pasted.document)
  for (const [bodyId, body] of Object.entries(pasted.bodies)) {
    writeCanvasNote(bodyId, body)
  }
  selectCanvasNodes(pasted.nodeIds)
  return pasted.nodeIds[0] ?? null
}

export function renameCanvasNodeTo(nodeId: CanvasNodeId, name: string): void {
  updateDocument((document) => renameCanvasNode(document, nodeId, name))
}

export function canvasNodeCanBeRenamed(nodeId: CanvasNodeId): boolean {
  const node = findCanvasNode(getAgentCanvasState().document, nodeId)?.node
  return node !== undefined && canvasNodeIsRenameable(node)
}

export function raiseCanvasNode(nodeId: CanvasNodeId, direction: 'front' | 'back'): void {
  updateDocument((document) =>
    direction === 'front'
      ? bringCanvasNodeToFront(document, nodeId)
      : sendCanvasNodeToBack(document, nodeId)
  )
}

export function disconnectCanvasNodeWires(nodeId: CanvasNodeId): void {
  updateDocument((document) => disconnectCanvasNode(document, nodeId))
}

export function setCanvasNodeLock(nodeId: CanvasNodeId, locked: boolean): void {
  updateDocument((document) => setCanvasNodeLocked(document, nodeId, locked))
}

/** Arranges the targeted cards in a grid, or aligns them on one edge. */
export function arrangeCanvasNodes(nodeIds: readonly CanvasNodeId[], align?: CanvasAlign): void {
  if (nodeIds.length < 2) {
    return
  }
  updateDocument((document) =>
    align ? alignCanvasNodes(document, nodeIds, align) : tidyCanvasNodes(document, nodeIds)
  )
}
