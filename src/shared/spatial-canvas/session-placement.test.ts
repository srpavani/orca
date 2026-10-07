import { describe, expect, it } from 'vitest'
import { addNode, connectNodes, createDocument, createSessionNode } from './document'
import { createLevel } from './level-edits'
import { levelIdOfNode, sessionNode } from './levels'
import {
  floorForBranch,
  freeGridSlot,
  gridSlot,
  normalizeBranch,
  syncSessionNodes,
  withoutSessions
} from './session-placement'

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

describe('withoutSessions', () => {
  it('drops only the cards of the named sessions, with their wires', () => {
    const ours = createSessionNode({ sessionId: 'ours', label: 'Ours', at: { x: 0, y: 0 } })
    const theirs = createSessionNode({ sessionId: 'theirs', label: 'Theirs', at: { x: 0, y: 0 } })
    const wired = connectNodes(
      addNode(addNode(createDocument(), ours), theirs),
      ours.id,
      theirs.id,
      'now'
    )!
    const kept = withoutSessions(wired.document, new Set(['theirs']))
    expect(kept.root.nodes.map((node) => node.id)).toEqual([ours.id])
    expect(kept.root.edges).toEqual([])
    expect(withoutSessions(wired.document, new Set())).toBe(wired.document)
  })
})

describe('freeGridSlot', () => {
  it('skips slots a hand-placed card overlaps', () => {
    const first = gridSlot(0)
    const handPlaced = createSessionNode({
      sessionId: 'mine',
      label: 'Mine',
      at: { x: first.x + 40, y: first.y + 50 }
    })
    expect(freeGridSlot({ nodes: [handPlaced] })).toEqual(gridSlot(1))
    expect(freeGridSlot({ nodes: [] })).toEqual(first)
  })
})
