import { useSyncExternalStore } from 'react'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import { normalizeBranch } from '../../../../shared/spatial-canvas/session-placement'

/**
 * Landing a floor from the canvas: the dialog's state, and the three host calls
 * behind it (targets, preview, merge). The merge itself lives in the main
 * process (`floor-landing.ts`); this side only knows which checkout a floor is.
 */

const LOCAL_RUNTIME = { kind: 'local' } as const

export type LandingRefusal = { reason: string } & Record<string, string>
export type LandingTarget = {
  name: string
  isGroundBranch: boolean
  unavailable: { worktreePath: string } | null
}
export type LandingPreflight =
  | { ok: false; refusal: LandingRefusal }
  | {
      ok: true
      floorBranch: string
      groundBranch: string | null
      targets: LandingTarget[]
      trackedDirty: boolean
      untrackedCount: number
      untrackedSample: string[]
    }
export type LandingPreview = { files: string[]; commitCount: number; conflicts: string[] }
export type LandingResult =
  | { status: 'merged'; target: string; floorBranch: string }
  | { status: 'refused'; refusal: LandingRefusal }
  | { status: 'conflicts'; files: string[] }
  | { status: 'failed'; detail: string }

export type LandingSheet = { levelId: string; name: string; branch: string } | null

let sheet: LandingSheet = null
const listeners = new Set<() => void>()

function setSheet(next: LandingSheet): void {
  sheet = next
  for (const listener of listeners) {
    listener()
  }
}

export function openLandingSheet(next: NonNullable<LandingSheet>): void {
  setSheet(next)
}

export function closeLandingSheet(): void {
  setSheet(null)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLandingSheet(): LandingSheet {
  return useSyncExternalStore(
    subscribe,
    () => sheet,
    () => sheet
  )
}

/** The checkout a floor works in: the worktree on the floor's branch. */
export function floorWorktreePath(branch: string): string | null {
  const wanted = normalizeBranch(branch)
  for (const rows of Object.values(useAppStore.getState().worktreesByRepo)) {
    const match = rows.find((row) => normalizeBranch(row.branch) === wanted)
    if (match) {
      return match.path
    }
  }
  return null
}

export function fetchLandingPreflight(worktreePath: string): Promise<LandingPreflight> {
  return callRuntimeRpc(LOCAL_RUNTIME, 'canvas.landingPreflight', { worktreePath })
}

export function fetchLandingPreview(worktreePath: string, target: string): Promise<LandingPreview> {
  return callRuntimeRpc(LOCAL_RUNTIME, 'canvas.landingPreview', { worktreePath, target })
}

export function landFloorOn(worktreePath: string, target: string): Promise<LandingResult> {
  return callRuntimeRpc(LOCAL_RUNTIME, 'canvas.landFloor', { worktreePath, target })
}

/** The reference's refusal sentences, one per reason the host can give. */
export function refusalText(refusal: LandingRefusal): string {
  const key = `auto.components.agentCanvas.landing.refusal.${refusal.reason}`
  switch (refusal.reason) {
    case 'notIsolated':
      return translate(key, 'This floor has no git isolation, so there is nothing to land.')
    case 'notARepository':
      return translate(key, '{{directory}} is not a git repository any more.', {
        directory: refusal.directory ?? ''
      })
    case 'worktreeMissing':
      return translate(
        key,
        "The floor's checkout is no longer registered with git ({{path}}). It may have been removed by hand.",
        { path: refusal.path ?? '' }
      )
    case 'detachedHead':
      return translate(
        key,
        "The floor's checkout is not on a branch (detached HEAD), so there is nothing to merge."
      )
    case 'targetMissing':
      return translate(key, 'The branch {{branch}} no longer exists.', {
        branch: refusal.branch ?? ''
      })
    case 'dirtyWorktree':
      return translate(
        key,
        'This floor has uncommitted changes. They would not land, so commit them on the floor first.'
      )
    case 'targetCheckedOutElsewhere':
      return translate(
        key,
        '{{branch}} is checked out in another worktree ({{path}}). Merging into it would desync that checkout, so it is not offered.',
        { branch: refusal.branch ?? '', path: refusal.worktreePath ?? '' }
      )
    case 'groundDirty':
      return translate(
        key,
        'Ground has uncommitted changes this merge would overwrite: {{detail}}. Commit or stash them on Ground first.',
        { detail: refusal.detail ?? '' }
      )
    default:
      return refusal.reason
  }
}
