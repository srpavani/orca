import { addNode, createSessionNode, removeNode } from '../../../../shared/spatial-canvas/document'
import { freeGridSlot } from '../../../../shared/spatial-canvas/session-placement'
import { everyEdge, levelContents, sessionNode } from '../../../../shared/spatial-canvas/levels'
import type { CanvasLevelId, CanvasRect } from '../../../../shared/spatial-canvas/types'
import { getAgentCanvasState, selectCanvasNodes, updateDocument } from './agent-canvas-store'
/**
 * Puts a terminal created from the board onto the floor the user is looking at.
 * The background sync would otherwise file it on its branch's floor, which is
 * not where the user is, so the card they just asked for never appears.
 */
export function placeCanvasSessionAt(
  sessionId: string,
  label: string,
  levelId: CanvasLevelId,
  /** Frame drawn on the board with the Add terminal tool; absent keeps the grid slot. */
  frame?: CanvasRect | null
): string | null {
  const existing = sessionNode(getAgentCanvasState().document, sessionId)
  if (existing) {
    // Why: the sync can file the new tab on its branch's floor before the create call
    // returns. An unnamed, unwired card is that copy; the board's request replaces it.
    const syncCopy =
      existing.content.kind === 'session' &&
      !existing.content.name &&
      !everyEdge(getAgentCanvasState().document).some(
        (edge) => edge.fromNodeId === existing.id || edge.toNodeId === existing.id
      )
    if (!syncCopy) {
      return existing.id
    }
    updateDocument((document) => removeNode(document, existing.id))
  }
  const floor =
    levelContents(getAgentCanvasState().document, levelId) ?? getAgentCanvasState().document.root
  const node = createSessionNode({
    sessionId,
    label,
    at: freeGridSlot(floor),
    size: getAgentCanvasState().document.elementDefaults?.sessionSize
  })
  if (frame) {
    node.frame = { ...frame }
  }
  // Why the name is pinned: the board created this card with the name the user
  // typed, so a later terminal-title change must not rename it.
  const pinned = {
    ...node,
    content: { ...node.content, name: label }
  }
  updateDocument((document) => addNode(document, pinned, levelId))
  selectCanvasNodes([pinned.id])
  return pinned.id
}
