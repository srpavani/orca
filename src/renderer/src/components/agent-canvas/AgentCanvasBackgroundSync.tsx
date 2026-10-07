import React from 'react'
import { useAppStore } from '@/store'
import { liveSessionsFromTabs } from './agent-canvas-sessions'
import { startCanvasHostSync, syncCanvasSessions, useAgentCanvas } from './agent-canvas-store'
import { useWorktreeBranches } from './use-worktree-branches'
import { useCanvasProjectSync } from './use-canvas-project-sync'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'

/**
 * Keeps the host canvas in step with open terminals for the whole app session,
 * not only while the canvas view is open: new sessions get a card (on their
 * branch's floor) right away, so agents can use `orca canvas` from the start.
 */
export function AgentCanvasBackgroundSync(): null {
  const projectKey = useCanvasProjectSync()
  const tabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const branches = useWorktreeBranches()
  const loaded = useAgentCanvas((state) => state.loaded)
  const { sessions, foreign } = React.useMemo(() => {
    // Why: each project's board holds only that repository's terminals.
    const ours = (worktreeId: string): boolean =>
      projectKey === null || getRepoIdFromWorktreeId(worktreeId) === projectKey
    const entries = Object.entries(tabsByWorktree)
    return {
      sessions: liveSessionsFromTabs(
        Object.fromEntries(entries.filter(([worktreeId]) => ours(worktreeId))),
        branches
      ),
      foreign: new Set(
        entries
          .filter(([worktreeId]) => !ours(worktreeId))
          .flatMap(([, tabs]) => tabs.map((tab) => tab.id))
      )
    }
  }, [tabsByWorktree, branches, projectKey])

  // Why a slow poll here: the open canvas page runs its own faster sync on top of this one.
  React.useEffect(() => startCanvasHostSync(5000), [])

  React.useEffect(() => {
    syncCanvasSessions(sessions, foreign)
  }, [sessions, foreign, loaded])

  return null
}
