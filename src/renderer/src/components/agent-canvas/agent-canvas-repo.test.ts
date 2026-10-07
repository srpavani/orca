import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))

import { canvasRepoIdFrom, floorWorktreeIdFrom } from './agent-canvas-repo'

const base: Parameters<typeof canvasRepoIdFrom>[0] = {
  activeRepoId: null,
  activeWorktreeId: null,
  repos: [],
  worktreesByRepo: {}
}

describe('canvasRepoIdFrom', () => {
  it('uses the active repository when Orca has one', () => {
    expect(canvasRepoIdFrom({ ...base, activeRepoId: 'r1' })).toBe('r1')
  })

  it('falls back to the repository of the active worktree', () => {
    expect(
      canvasRepoIdFrom({
        ...base,
        activeWorktreeId: 'w2',
        repos: [{ id: 'r1' }, { id: 'r2' }],
        worktreesByRepo: { r1: [{ id: 'w1' }], r2: [{ id: 'w2' }] }
      })
    ).toBe('r2')
  })

  it('falls back to the only git repository registered', () => {
    expect(canvasRepoIdFrom({ ...base, repos: [{ id: 'r1', kind: 'git' }] })).toBe('r1')
  })

  it('does not guess between several repositories', () => {
    expect(canvasRepoIdFrom({ ...base, repos: [{ id: 'r1' }, { id: 'r2' }] })).toBeNull()
  })

  it('ignores folder workspaces that are not git', () => {
    expect(canvasRepoIdFrom({ ...base, repos: [{ id: 'f1', kind: 'folder' }] })).toBeNull()
  })
})

describe('floorWorktreeIdFrom', () => {
  const state = {
    ...base,
    repos: [{ id: 'r1', kind: 'git' }],
    worktreesByRepo: {
      r1: [
        { id: 'main-wt', branch: 'refs/heads/main', isMainWorktree: true },
        { id: 'feat-wt', branch: 'refs/heads/feature-x' }
      ]
    }
  }

  it('runs a floor pinned to a branch in that branch worktree', () => {
    expect(floorWorktreeIdFrom(state, 'feature-x')).toBe('feat-wt')
  })

  it('uses the active worktree on the ground floor', () => {
    expect(floorWorktreeIdFrom({ ...state, activeWorktreeId: 'feat-wt' }, null)).toBe('feat-wt')
  })

  it('falls back to the main worktree when nothing is active', () => {
    expect(floorWorktreeIdFrom(state, null)).toBe('main-wt')
  })

  it('is null only when Orca has no worktree at all', () => {
    expect(floorWorktreeIdFrom({ ...base }, null)).toBeNull()
  })
})
