import React from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'

type RepoLookup = {
  activeRepoId: string | null
  activeWorktreeId: string | null
  repos: readonly { id: string; kind?: string }[]
  worktreesByRepo: Readonly<Record<string, readonly { id: string }[]>>
}

/**
 * The repository the canvas works in. Orca sets `activeRepoId` only once a
 * worktree has been opened, so a session that went straight to the canvas has
 * none — which is why New floor offered no isolation. Fall back to the active
 * worktree's repository, then to the only git repository registered.
 */
export function canvasRepoIdFrom(state: RepoLookup): string | null {
  if (state.activeRepoId !== null) {
    return state.activeRepoId
  }
  if (state.activeWorktreeId !== null) {
    for (const [repoId, rows] of Object.entries(state.worktreesByRepo)) {
      if (rows.some((row) => row.id === state.activeWorktreeId)) {
        return repoId
      }
    }
  }
  const gitRepos = state.repos.filter((repo) => repo.kind === undefined || repo.kind === 'git')
  return gitRepos.length === 1 ? (gitRepos[0]?.id ?? null) : null
}

export function canvasRepoId(): string | null {
  return canvasRepoIdFrom(useAppStore.getState())
}

export function useCanvasRepoId(): string | null {
  return useAppStore((state) => canvasRepoIdFrom(state))
}

/**
 * Whether the repository has a first commit: true, false, or null while asking.
 * A floor's checkout branches from it, so without one isolation cannot work.
 */
export function useRepoHasCommits(repoPath: string | null): boolean | null {
  const [answer, setAnswer] = React.useState<{ path: string; value: boolean } | null>(null)
  React.useEffect(() => {
    if (repoPath === null) {
      return
    }
    let live = true
    callRuntimeRpc<boolean>({ kind: 'local' }, 'canvas.repoHasCommits', { repoPath }).then(
      (value) => {
        if (live) {
          setAnswer({ path: repoPath, value })
        }
      },
      // Why true on failure: an older runtime without this method must not block
      // isolation; the worktree creation still reports its own error.
      () => {
        if (live) {
          setAnswer({ path: repoPath, value: true })
        }
      }
    )
    return () => {
      live = false
    }
  }, [repoPath])
  return answer !== null && answer.path === repoPath ? answer.value : null
}

type WorktreeRow = { id: string; branch?: string | null; isMainWorktree?: boolean }

function bareBranch(branch: string | null | undefined): string {
  return (branch ?? '').replace(/^refs\/heads\//, '')
}

/**
 * Where a terminal created on a floor runs, as the reference opens it in the
 * floor's own directory: a floor pinned to a branch uses that branch's
 * worktree; the ground floor (or a plain floor) uses the active worktree, then
 * the canvas repository's main worktree. Null only when Orca has no worktree
 * at all, which is the one case that really needs a workspace opened first.
 */
export function floorWorktreeIdFrom(
  state: Omit<RepoLookup, 'worktreesByRepo'> & {
    worktreesByRepo: Readonly<Record<string, readonly WorktreeRow[]>>
  },
  floorBranch: string | null
): string | null {
  const repoId = canvasRepoIdFrom(state)
  const rows = repoId === null ? [] : (state.worktreesByRepo[repoId] ?? [])
  if (floorBranch !== null) {
    const wanted = bareBranch(floorBranch)
    const pinned = rows.find((row) => bareBranch(row.branch) === wanted)
    if (pinned) {
      return pinned.id
    }
  }
  if (state.activeWorktreeId !== null) {
    return state.activeWorktreeId
  }
  const main = rows.find((row) => row.isMainWorktree === true) ?? rows[0]
  if (main) {
    return main.id
  }
  for (const all of Object.values(state.worktreesByRepo)) {
    if (all[0]) {
      return all[0].id
    }
  }
  return null
}
