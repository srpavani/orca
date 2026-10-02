import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { CanvasLiveSession } from '../../../../shared/spatial-canvas/session-placement'

export {
  gridSlot,
  syncSessionNodes,
  type CanvasLiveSession
} from '../../../../shared/spatial-canvas/session-placement'

export function sessionLabel(tab: TerminalTab): string {
  return tab.customTitle || tab.generatedTitle || tab.title || tab.defaultTitle || tab.id
}

export function liveSessionsFromTabs(
  tabsByWorktree: Readonly<Record<string, readonly TerminalTab[]>>,
  branchByWorktreeId: ReadonlyMap<string, string | null> = new Map()
): CanvasLiveSession[] {
  const sessions: CanvasLiveSession[] = []
  for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
    const branch = branchByWorktreeId.get(worktreeId) ?? null
    for (const tab of tabs) {
      sessions.push({ sessionId: tab.id, label: sessionLabel(tab), worktreeId, branch })
    }
  }
  return sessions
}
