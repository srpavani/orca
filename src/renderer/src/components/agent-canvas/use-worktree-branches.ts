import React from 'react'
import { useAppStore } from '@/store'

/** worktreeId → branch, rebuilt only when the worktree catalog changes. */
export function useWorktreeBranches(): ReadonlyMap<string, string | null> {
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  return React.useMemo(() => {
    const branches = new Map<string, string | null>()
    for (const worktrees of Object.values(worktreesByRepo)) {
      for (const worktree of worktrees) {
        branches.set(worktree.id, worktree.branch || null)
      }
    }
    return branches
  }, [worktreesByRepo])
}
