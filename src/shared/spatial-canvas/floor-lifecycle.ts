/**
 * Floor unload and wake.
 *
 * An isolated floor owns a checkout. Unloading it frees that checkout — the
 * floor stays on the board with its cards and notes, but its files are no longer
 * taken up. Waking it brings the checkout back. The reference calls this
 * `unloaded` and shows it as a badge on the floor; Orca already has the
 * machinery underneath (a managed worktree can sleep and wake), so the state
 * simply has to be remembered on the floor.
 */

export type FloorLoadState = 'active' | 'unloaded'

/** A floor can only be unloaded when it actually has a checkout of its own. */
export function canUnloadFloor(level: { branch: string | null }): boolean {
  return level.branch !== null && level.branch.trim().length > 0
}

export function floorLoadState(level: { state?: FloorLoadState }): FloorLoadState {
  return level.state ?? 'active'
}

export function levelIsUnloaded(level: { state?: FloorLoadState }): boolean {
  return floorLoadState(level) === 'unloaded'
}

/** Applies a load state to a level descriptor, keeping the rest untouched. */
export function withFloorLoadState<T extends { state?: FloorLoadState }>(
  level: T,
  state: FloorLoadState
): T {
  return { ...level, state }
}
