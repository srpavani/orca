import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { createLevel, moveNodeToLevel } from '../../../../shared/spatial-canvas/level-edits'
import { everyNode } from '../../../../shared/spatial-canvas/levels'
import { normalizeBranch } from '../../../../shared/spatial-canvas/session-placement'
import type { CanvasDocument } from '../../../../shared/spatial-canvas/types'
import { setCanvasViewState, updateDocument } from './agent-canvas-store'

type WorktreeRow = { id: string; repoId: string; branch: string; displayName: string; path: string }

/** The worktree already checked out on `branch` in `repoId`, if any. */
export function findBranchWorktree(
  worktreesByRepo: Readonly<Record<string, readonly WorktreeRow[]>>,
  repoId: string,
  branch: string
): WorktreeRow | null {
  const wanted = normalizeBranch(branch)
  return (
    (worktreesByRepo[repoId] ?? []).find(
      (worktree) => normalizeBranch(worktree.branch) === wanted
    ) ?? null
  )
}

/**
 * Creates (or reuses) the floor pinned to `branch` and moves every canvas
 * session whose tab belongs to `worktreeId` onto it. Later sessions of that
 * worktree are placed there automatically by session placement.
 */
export function pinFloorToWorktree(
  document: CanvasDocument,
  input: { name: string; branch: string; sessionIds: ReadonlySet<string> }
): { document: CanvasDocument; levelId: string } {
  const wanted = normalizeBranch(input.branch)
  const existing = document.levels.find((level) => normalizeBranch(level.branch) === wanted)
  let next = document
  let levelId = existing?.id ?? null
  if (levelId === null) {
    const created = createLevel(document, { name: input.name, branch: wanted })
    next = created.document
    levelId = created.levelId
  }
  for (const node of everyNode(next)) {
    if (node.content.kind === 'session' && input.sessionIds.has(node.content.sessionId)) {
      next = moveNodeToLevel(next, node.id, levelId)
    }
  }
  return { document: next, levelId }
}

/**
 * Floor-per-branch: opens the git worktree for `branch` (creating it from the
 * repo's default base when it does not exist yet), then pins a floor to it.
 * The new worktree's startup terminal lands on that floor by itself.
 */
export async function openBranchFloor(
  repoId: string,
  branch: string,
  /** Floor name; without it the branch names the floor. */
  floorName?: string
): Promise<boolean> {
  const name = normalizeBranch(branch)
  if (!name) {
    return false
  }
  const store = useAppStore.getState()
  let worktree = findBranchWorktree(store.worktreesByRepo, repoId, name)
  if (!worktree) {
    try {
      const created = await store.createWorktree(
        repoId,
        name.replace(/[^A-Za-z0-9._-]+/g, '-'),
        undefined,
        'inherit',
        undefined,
        'unknown',
        name,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        name
      )
      worktree = created.worktree
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.agentCanvas.branchFloorFailed',
              'Could not create the worktree for this floor.'
            )
      )
      return false
    }
  }
  const tabs = useAppStore.getState().tabsByWorktree[worktree.id] ?? []
  const sessionIds = new Set(tabs.map((tab) => tab.id))
  const name2 = floorName?.trim() || name
  let levelId: string | null = null
  updateDocument((document) => {
    const result = pinFloorToWorktree(document, { name: name2, branch: name, sessionIds })
    levelId = result.levelId
    return result.document
  })
  if (levelId !== null) {
    setCanvasViewState({ activeLevelId: levelId, selectedNodeId: null })
  }
  // Why: activating the worktree mounts its terminals, so the startup session gets a tab
  // (and therefore a card on this floor) even though the user stays on the canvas.
  activateAndRevealWorktree(worktree.id, { sidebarRevealBehavior: 'auto' })
  useAppStore.getState().openCanvasPage()
  followWorktreeTabs(worktree.id, name)
  return true
}

const FOLLOW_MS = 15_000

/**
 * Why: a fresh worktree's startup tab can be placed before the store learns the
 * worktree's branch, which would drop it on the ground floor. For a short window
 * every tab that worktree opens is moved onto its floor.
 */
function followWorktreeTabs(worktreeId: string, branch: string): void {
  const seen = new Set<string>()
  const pin = (): void => {
    const tabs = useAppStore.getState().tabsByWorktree[worktreeId] ?? []
    const fresh = tabs.filter((tab) => !seen.has(tab.id))
    if (fresh.length === 0) {
      return
    }
    for (const tab of fresh) {
      seen.add(tab.id)
    }
    updateDocument(
      (document) =>
        pinFloorToWorktree(document, {
          name: branch,
          branch,
          sessionIds: new Set(fresh.map((tab) => tab.id))
        }).document
    )
  }
  const unsubscribe = useAppStore.subscribe(pin)
  // Why: the background sync places tabs asynchronously; re-pin once it has run.
  const timer = setInterval(() => {
    seen.clear()
    pin()
  }, 2000)
  setTimeout(() => {
    unsubscribe()
    clearInterval(timer)
  }, FOLLOW_MS)
}
