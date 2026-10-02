import { isTerminalLeafId, makePaneKey } from '../../../../shared/stable-pane-id'
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode
} from '../../../../shared/terminal-tab-types'
import type { ActivityTerminalPortalTarget } from '../activity/activity-terminal-portal'

/** A card that asked to host its live terminal, with the element to portal into. */
export type CanvasLivePaneRequest = {
  nodeId: string
  sessionId: string
  worktreeId: string
  target: HTMLElement
  focused: boolean
}

export const CANVAS_PORTAL_SLOT_PREFIX = 'agent-canvas:'

/** At most this many cards host a live xterm at once; the rest stay as cards. */
export const MAX_LIVE_CANVAS_PANES = 6

function firstLeaf(node: TerminalPaneLayoutNode | null): string | null {
  if (node === null) {
    return null
  }
  return node.type === 'leaf' ? node.leafId : (firstLeaf(node.first) ?? firstLeaf(node.second))
}

/** The pane a canvas card projects: the tab's active leaf, else its first one. */
export function canvasPaneKey(
  tabId: string,
  layout: TerminalLayoutSnapshot | undefined
): string | null {
  const leaf = layout?.activeLeafId ?? firstLeaf(layout?.root ?? null)
  if (!leaf || !isTerminalLeafId(leaf) || tabId.includes(':')) {
    return null
  }
  return makePaneKey(tabId, leaf)
}

/**
 * Builds the portal descriptors that move live panes into canvas cards.
 * Focused cards come first so the cap never drops the one the user is typing in.
 */
export function buildCanvasPortals(
  requests: readonly CanvasLivePaneRequest[],
  layouts: Readonly<Record<string, TerminalLayoutSnapshot | undefined>>
): ActivityTerminalPortalTarget[] {
  const ordered = [...requests].sort((left, right) => Number(right.focused) - Number(left.focused))
  const portals: ActivityTerminalPortalTarget[] = []
  for (const request of ordered) {
    if (portals.length >= MAX_LIVE_CANVAS_PANES) {
      break
    }
    const paneKey = canvasPaneKey(request.sessionId, layouts[request.sessionId])
    if (paneKey === null) {
      continue
    }
    const slotId = `${CANVAS_PORTAL_SLOT_PREFIX}${request.nodeId}`
    portals.push({
      slotId,
      requestToken: `${slotId}:${paneKey}`,
      target: request.target,
      worktreeId: request.worktreeId,
      tabId: request.sessionId,
      paneKey,
      active: request.focused
    })
  }
  return portals
}
