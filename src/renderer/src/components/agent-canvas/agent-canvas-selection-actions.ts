import type { CanvasNodeId } from '../../../../shared/spatial-canvas/types'
import { getAgentCanvasState, removeCanvasNode, selectCanvasNode } from './agent-canvas-store'
import { copyCanvasSelection } from './agent-canvas-node-actions'

/**
 * Deletes every selected card at once — the reference's deleteSelection, which
 * removes the whole selection, not just the card clicked last. Locked cards
 * stay, as they do there. Returns how many were removed.
 */
export function deleteCanvasSelection(): number {
  const { document, selectedNodeIds } = getAgentCanvasState()
  const locked = new Set(
    [...document.root.nodes, ...document.levels.flatMap((level) => level.nodes)]
      .filter((node) => node.locked === true)
      .map((node) => node.id)
  )
  const doomed = selectedNodeIds.filter((id) => !locked.has(id))
  selectCanvasNode(null)
  for (const id of doomed) {
    removeCanvasNode(id)
  }
  return doomed.length
}

/** Copies the whole selection; the card menu's Copy does the same for one card. */
export function copyCanvasSelectionNow(): number {
  return copyCanvasSelection(getAgentCanvasState().selectedNodeIds)
}

export function selectedCanvasNodeIds(): readonly CanvasNodeId[] {
  return getAgentCanvasState().selectedNodeIds
}
