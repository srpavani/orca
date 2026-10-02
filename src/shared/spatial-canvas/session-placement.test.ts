import { describe, expect, it } from 'vitest'
import { addNode, createDocument, createSessionNode } from './document'
import { createLevel } from './level-edits'
import { levelIdOfNode, sessionNode } from './levels'
import { floorForBranch, gridSlot, normalizeBranch, syncSessionNodes } from './session-placement'

function ids(): () => string {
  let next = 0
  return () => `id-${++next}`
}

describe('session placement by branch', () => {
  it('normalizes refs/heads prefixes and blanks', () => {
    expect(normalizeBranch('refs/heads/feature/x')).toBe('feature/x')
    expect(normalizeBranch('  ')).toBeNull()
    expect(normalizeBranch(undefined)).toBeNull()
  })

  it('puts a new session on the floor pinned to its branch, others on the ground', () => {
    const id = ids()
    const { document, levelId } = createLevel(
      createDocument(),
      { name: 'X', branch: 'feature/x' },
      id
    )
    expect(floorForBranch(document, 'refs/heads/feature/x')).toBe(levelId)
    const placed = syncSessionNodes(
      document,
      [
        { sessionId: 'a', label: 'A', worktreeId: 'w1', branch: 'main' },
        { sessionId: 'b', label: 'B', worktreeId: 'w2', branch: 'refs/heads/feature/x' }
      ],
      id
    )
    expect(levelIdOfNode(placed, sessionNode(placed, 'a')!.id)).toBeNull()
    const b = sessionNode(placed, 'b')!
    expect(levelIdOfNode(placed, b.id)).toBe(levelId)
    // Grid slots count per floor, so the first card on a floor starts at slot 0.
    expect({ x: b.frame.x, y: b.frame.y }).toEqual(gridSlot(0))
  })

  it('never moves a session the user already placed', () => {
    const id = ids()
    const { document, levelId } = createLevel(
      createDocument(),
      { name: 'X', branch: 'feature/x' },
      id
    )
    const onGround = addNode(
      document,
      createSessionNode({ sessionId: 'b', label: 'B', at: { x: 0, y: 0 }, id })
    )
    const synced = syncSessionNodes(
      onGround,
      [{ sessionId: 'b', label: 'B', worktreeId: 'w2', branch: 'feature/x' }],
      id
    )
    expect(synced).toBe(onGround)
    expect(levelIdOfNode(synced, sessionNode(synced, 'b')!.id)).not.toBe(levelId)
  })
})
