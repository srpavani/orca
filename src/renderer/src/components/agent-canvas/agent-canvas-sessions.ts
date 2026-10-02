import {
  DEFAULT_NODE_SIZE,
  addNode,
  createSessionNode,
  newCanvasId,
  type CanvasIdFactory
} from '../../../../shared/spatial-canvas/document'
import { GROUND_ORIGIN } from '../../../../shared/spatial-canvas/geometry'
import { everyNode } from '../../../../shared/spatial-canvas/levels'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type {
  CanvasDocument,
  CanvasLevelContents,
  CanvasNode,
  CanvasPoint
} from '../../../../shared/spatial-canvas/types'

/** A terminal session the canvas can project. `sessionId` is the Orca tab id. */
export type CanvasLiveSession = {
  sessionId: string
  label: string
  worktreeId: string
}

const GRID_COLUMNS = 3
const GRID_GAP = 80

export function sessionLabel(tab: TerminalTab): string {
  return tab.customTitle || tab.generatedTitle || tab.title || tab.defaultTitle || tab.id
}

export function liveSessionsFromTabs(
  tabsByWorktree: Readonly<Record<string, readonly TerminalTab[]>>
): CanvasLiveSession[] {
  const sessions: CanvasLiveSession[] = []
  for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
    for (const tab of tabs) {
      sessions.push({ sessionId: tab.id, label: sessionLabel(tab), worktreeId })
    }
  }
  return sessions
}

/** Next free slot in a left-to-right grid, so auto-placed sessions never overlap. */
export function gridSlot(index: number): CanvasPoint {
  const column = index % GRID_COLUMNS
  const row = Math.floor(index / GRID_COLUMNS)
  return {
    x: GROUND_ORIGIN.x + GRID_GAP + column * (DEFAULT_NODE_SIZE.width + GRID_GAP),
    y: GROUND_ORIGIN.y + GRID_GAP + row * (DEFAULT_NODE_SIZE.height + GRID_GAP)
  }
}

function relabel(
  contents: CanvasLevelContents,
  labels: ReadonlyMap<string, string>
): CanvasLevelContents {
  let changed = false
  const nodes = contents.nodes.map((node): CanvasNode => {
    if (node.content.kind !== 'session') {
      return node
    }
    const label = labels.get(node.content.sessionId)
    if (label === undefined || label === node.content.label) {
      return node
    }
    changed = true
    return { ...node, content: { ...node.content, label } }
  })
  return changed ? { ...contents, nodes } : contents
}

/**
 * Projects live sessions onto the canvas: unseen sessions get a grid slot and
 * known ones follow their tab's title. Sessions that disappeared are kept on
 * purpose — tabs hydrate after the canvas, and dropping a node would silently
 * revoke every wire (permission) attached to it.
 */
export function syncSessionNodes(
  document: CanvasDocument,
  sessions: readonly CanvasLiveSession[],
  id: CanvasIdFactory = newCanvasId
): CanvasDocument {
  const labels = new Map(sessions.map((session) => [session.sessionId, session.label]))
  const root = relabel(document.root, labels)
  const levels = document.levels.map((level) => {
    const contents = relabel(level, labels)
    return contents === level ? level : { ...level, ...contents }
  })
  // Why: keep the reference when nothing changed so the store skips re-render and persistence.
  const relabelled: CanvasDocument =
    root === document.root && levels.every((level, index) => level === document.levels[index])
      ? document
      : { ...document, root, levels }
  const placed = new Set<string>()
  for (const node of everyNode(relabelled)) {
    if (node.content.kind === 'session') {
      placed.add(node.content.sessionId)
    }
  }
  let next = relabelled
  let slot = relabelled.root.nodes.length
  for (const session of sessions) {
    if (placed.has(session.sessionId)) {
      continue
    }
    const node = createSessionNode({
      sessionId: session.sessionId,
      label: session.label,
      at: gridSlot(slot),
      id
    })
    next = addNode(next, node)
    placed.add(session.sessionId)
    slot += 1
  }
  return next
}
