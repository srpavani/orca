import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))

import { canvasRepoIdFrom } from './agent-canvas-repo'

const base = {
  activeRepoId: null,
  activeWorktreeId: null,
  repos: [] as { id: string; kind?: string }[],
  worktreesByRepo: {} as Record<string, { id: string }[]>
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
