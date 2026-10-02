import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}), subscribe: () => () => {} } }))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import {
  addNode,
  createDocument,
  createSessionNode
} from '../../../../shared/spatial-canvas/document'
import { createLevel } from '../../../../shared/spatial-canvas/level-edits'
import { levelIdOfNode, sessionNode } from '../../../../shared/spatial-canvas/levels'
import { findBranchWorktree, pinFloorToWorktree } from './agent-canvas-branch-floor'

const AT = { x: 0, y: 0 }

describe('branch floors', () => {
  it('finds the worktree already on a branch, ignoring refs/heads', () => {
    const rows = {
      repo: [
        {
          id: 'w1',
          repoId: 'repo',
          branch: 'refs/heads/main',
          displayName: 'main',
          path: '/w/main'
        },
        {
          id: 'w2',
          repoId: 'repo',
          branch: 'refs/heads/feature/x',
          displayName: 'x',
          path: '/w/x'
        }
      ]
    }
    expect(findBranchWorktree(rows, 'repo', 'feature/x')?.id).toBe('w2')
    expect(findBranchWorktree(rows, 'repo', 'nope')).toBeNull()
  })

  it('creates the pinned floor once and moves that worktree’s sessions onto it', () => {
    let document = addNode(
      addNode(createDocument(), createSessionNode({ sessionId: 's1', label: 'S1', at: AT })),
      createSessionNode({ sessionId: 'other', label: 'Other', at: AT })
    )
    const first = pinFloorToWorktree(document, {
      name: 'feature/x',
      branch: 'refs/heads/feature/x',
      sessionIds: new Set(['s1'])
    })
    document = first.document
    expect(document.levels).toHaveLength(1)
    expect(document.levels[0].branch).toBe('feature/x')
    expect(levelIdOfNode(document, sessionNode(document, 's1')!.id)).toBe(first.levelId)
    expect(levelIdOfNode(document, sessionNode(document, 'other')!.id)).toBeNull()

    const again = pinFloorToWorktree(document, {
      name: 'feature/x',
      branch: 'feature/x',
      sessionIds: new Set(['s1'])
    })
    expect(again.levelId).toBe(first.levelId)
    expect(again.document.levels).toHaveLength(1)
  })

  it('reuses a floor the user already pinned to the branch', () => {
    const pinned = createLevel(createDocument(), { name: 'Mine', branch: 'feature/x' })
    expect(
      pinFloorToWorktree(pinned.document, { name: 'x', branch: 'feature/x', sessionIds: new Set() })
        .levelId
    ).toBe(pinned.levelId)
  })
})
