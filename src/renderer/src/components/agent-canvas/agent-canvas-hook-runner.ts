import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import {
  buildHookEnvironment,
  documentHooks,
  hookCommandLine,
  shouldRunHookSection,
  type FloorHookSection
} from '../../../../shared/spatial-canvas/floor-hooks'
import type { CanvasLevelId } from '../../../../shared/spatial-canvas/types'
import { findBranchWorktree } from './agent-canvas-branch-floor'
import { getAgentCanvasState } from './agent-canvas-store'
import { canvasRepoId } from './agent-canvas-repo'

const LOCAL_RUNTIME = { kind: 'local' } as const

/**
 * Runs a floor's hook section in that floor's own checkout, in a terminal that
 * does not steal focus: a hook is a side effect of opening a floor, not
 * something to interrupt the user with.
 *
 * Why a terminal rather than a bare process: it is where the output belongs, it
 * survives the floor being opened, and the user can see and stop it. The
 * reference runs hooks silently; this is the closest Orca gets without inventing
 * a second command runner.
 */
export async function runFloorHooks(
  section: FloorHookSection,
  levelId: CanvasLevelId
): Promise<boolean> {
  const { document } = getAgentCanvasState()
  const hooks = documentHooks(document)
  if (!shouldRunHookSection(hooks, section)) {
    return false
  }
  const command = hookCommandLine(hooks, section)
  if (command === null) {
    return false
  }
  const level = levelId === null ? null : document.levels.find((entry) => entry.id === levelId)
  const branch = level?.branch ?? null
  const app = useAppStore.getState()
  const repoId = canvasRepoId()
  const worktree =
    repoId !== null && branch !== null
      ? findBranchWorktree(app.worktreesByRepo, repoId, branch)
      : null
  const worktreeId = worktree?.id ?? app.activeWorktreeId
  if (worktreeId === null) {
    return false
  }
  const active = app.worktreesByRepo[repoId ?? '']
  const groundPath = active?.find((entry) => entry.id === worktreeId)?.path ?? ''
  // Why only the added variables: the PTY already inherits the app's environment,
  // so shipping the whole of process.env across the RPC would be noise.
  const environment = buildHookEnvironment({
    floor: {
      name: level?.name ?? 'Ground',
      branchName: branch,
      clonePath: worktree?.path ?? null,
      workingSubdirectory: null
    },
    workspace: { name: repoId ?? '', rootPath: groundPath },
    base: {}
  })
  try {
    await callRuntimeRpc(
      LOCAL_RUNTIME,
      'session.tabs.createTerminal',
      {
        worktree: `id:${worktreeId}`,
        command,
        env: environment,
        // Why silent: opening a floor must not move the user's focus.
        activate: false,
        select: false
      },
      { timeoutMs: 60_000 }
    )
    return true
  } catch {
    // A hook that cannot start is not worth interrupting the user over; the
    // floor itself is unaffected.
    return false
  }
}
