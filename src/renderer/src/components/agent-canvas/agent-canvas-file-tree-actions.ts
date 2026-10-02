import { useAppStore } from '@/store'
import { addNode } from '../../../../shared/spatial-canvas/document'
import {
  createFileTreeNode,
  toggleFileTreeFolder
} from '../../../../shared/spatial-canvas/file-tree'
import type { CanvasNodeId, CanvasPoint } from '../../../../shared/spatial-canvas/types'
import { getAgentCanvasState, selectCanvasNodes, updateDocument } from './agent-canvas-store'

/**
 * The worktree a new file tree shows: the active one, as the reference roots its
 * tree in the workspace's directory. Null when no worktree is open.
 */
function activeWorktree(): { id: string; name: string } | null {
  const state = useAppStore.getState()
  const id = state.activeWorktreeId
  if (!id) {
    return null
  }
  for (const rows of Object.values(state.worktreesByRepo)) {
    const row = rows.find((entry) => entry.id === id)
    if (row) {
      const folder =
        row.path
          .replace(/[\\/]+$/, '')
          .split(/[\\/]/)
          .at(-1) ?? row.path
      return { id, name: row.displayName || folder }
    }
  }
  return null
}

export function canAddCanvasFileTree(): boolean {
  return activeWorktree() !== null
}

/** Places a file tree for the active worktree on the floor being viewed. */
export function addCanvasFileTree(at: CanvasPoint): CanvasNodeId | null {
  const worktree = activeWorktree()
  if (!worktree) {
    return null
  }
  const node = createFileTreeNode({ worktreeId: worktree.id, rootName: worktree.name, at })
  const { activeLevelId } = getAgentCanvasState()
  updateDocument((document) => addNode(document, node, activeLevelId))
  selectCanvasNodes([node.id])
  return node.id
}

export function toggleCanvasFileTreeFolder(nodeId: CanvasNodeId, path: string): void {
  updateDocument((document) => toggleFileTreeFolder(document, nodeId, path))
}
