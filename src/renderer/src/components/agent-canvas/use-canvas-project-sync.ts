import { useEffect } from 'react'
import { useCanvasRepoId } from './agent-canvas-repo'
import { setCanvasProjectContext } from './agent-canvas-store'

/**
 * Keeps the canvas on the board of the repository the user is working in, the
 * way each Maestri workspace has its own canvas. Floors already cover that
 * repository's branches, so the board is keyed by repo, not by worktree.
 */
export function useCanvasProjectSync(): string | null {
  const repoId = useCanvasRepoId()
  useEffect(() => {
    setCanvasProjectContext(repoId)
  }, [repoId])
  return repoId
}
