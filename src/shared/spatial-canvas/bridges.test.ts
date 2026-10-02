import { describe, expect, it } from 'vitest'
import { bridgeSessions, bridgesTouchingLevel } from './bridges'
import {
  addNode,
  connectNodes,
  createDocument,
  createNoteNode,
  createSessionNode,
  removeNode
} from './document'
import { createLevel, deleteLevel, moveNodeToLevel } from './level-edits'
import { canReach, reachableFrom } from './reachability'
import type { CanvasDocument, CanvasNode } from './types'

function ids(): () => string {
  let next = 0
  return () => `id-${++next}`
}

const AT = { x: 100, y: 100 }

function twoFloors(): {
  document: CanvasDocument
  ground: CanvasNode
  upstairs: CanvasNode
  levelId: string
  id: () => string
} {
  const id = ids()
  const ground = createSessionNode({ sessionId: 'g', label: 'Ground agent', at: AT, id })
  const upstairs = createSessionNode({ sessionId: 'u', label: 'Feature agent', at: AT, id })
  const floor = createLevel(addNode(createDocument(), ground), { name: 'feature/x' }, id)
  return {
    document: addNode(floor.document, upstairs, floor.levelId),
    ground,
    upstairs,
    levelId: floor.levelId,
    id
  }
}

describe('bridgeSessions', () => {
  it('refuses a plain wire across floors but grants one hop through a bridge', () => {
    const { document, ground, upstairs, id } = twoFloors()
    expect(connectNodes(document, ground.id, upstairs.id, 'now', id)).toBeNull()
    expect(canReach(document, 'g', 'u')).toBe(false)

    const result = bridgeSessions(document, ground.id, upstairs.id, id)
    if ('refused' in result) {
      throw new Error(result.refused)
    }
    expect(canReach(result.document, 'g', 'u')).toBe(true)
    expect(canReach(result.document, 'u', 'g')).toBe(true)
    expect(reachableFrom(result.document, 'u').sessions.map((peer) => peer.label)).toEqual([
      'Ground agent'
    ])
  })

  it('stays one hop: a peer of the bridged session is not reachable', () => {
    const { document, ground, upstairs, levelId, id } = twoFloors()
    const helper = createSessionNode({ sessionId: 'h', label: 'Helper', at: AT, id })
    let next = addNode(document, helper, levelId)
    next = connectNodes(next, upstairs.id, helper.id, 'now', id)!.document
    const result = bridgeSessions(next, ground.id, upstairs.id, id)
    if ('refused' in result) {
      throw new Error(result.refused)
    }
    expect(canReach(result.document, 'g', 'h')).toBe(false)
  })

  it.each([
    ['same-level', true],
    ['not-sessions', false]
  ] as const)('refuses %s', (reason, sameFloor) => {
    const { document, ground, id } = twoFloors()
    const other = sameFloor
      ? createSessionNode({ sessionId: 's2', label: 'S2', at: AT, id })
      : createNoteNode({ noteId: 'n', at: AT, id })
    const placed = sameFloor
      ? addNode(document, other)
      : addNode(document, other, document.levels[0].id)
    expect(bridgeSessions(placed, ground.id, other.id, id)).toEqual({ refused: reason })
  })

  it('refuses a duplicate bridge in either direction', () => {
    const { document, ground, upstairs, id } = twoFloors()
    const first = bridgeSessions(document, ground.id, upstairs.id, id)
    if ('refused' in first) {
      throw new Error(first.refused)
    }
    expect(bridgeSessions(first.document, upstairs.id, ground.id, id)).toEqual({
      refused: 'duplicate'
    })
  })

  it('deleting the marker revokes the bridge', () => {
    const { document, ground, upstairs, id } = twoFloors()
    const result = bridgeSessions(document, ground.id, upstairs.id, id)
    if ('refused' in result) {
      throw new Error(result.refused)
    }
    const cut = removeNode(result.document, result.bridge.bridgeNodeId)
    expect(cut.bridges).toEqual([])
    expect(canReach(cut, 'g', 'u')).toBe(false)
  })

  it('lists bridges per floor with the far end resolved', () => {
    const { document, ground, upstairs, levelId, id } = twoFloors()
    const result = bridgeSessions(document, ground.id, upstairs.id, id)
    if ('refused' in result) {
      throw new Error(result.refused)
    }
    const upstairsView = bridgesTouchingLevel(result.document, levelId)
    expect(upstairsView.map((entry) => [entry.far?.id, entry.farLevelId])).toEqual([
      [ground.id, null]
    ])
  })
})

describe('bridges follow floor edits', () => {
  it('drops a bridge when both ends end up on the same floor', () => {
    const { document, ground, upstairs, levelId, id } = twoFloors()
    const result = bridgeSessions(document, ground.id, upstairs.id, id)
    if ('refused' in result) {
      throw new Error(result.refused)
    }
    const merged = moveNodeToLevel(result.document, ground.id, levelId)
    expect(merged.bridges).toEqual([])
    expect(merged.levels[0].nodes.some((node) => node.content.kind === 'bridge')).toBe(false)
  })

  it('re-homes a bridge when one end moves to a third floor', () => {
    const { document, ground, upstairs, id } = twoFloors()
    const result = bridgeSessions(document, ground.id, upstairs.id, id)
    if ('refused' in result) {
      throw new Error(result.refused)
    }
    const third = createLevel(result.document, { name: 'third' }, id)
    const moved = moveNodeToLevel(third.document, upstairs.id, third.levelId)
    expect(moved.bridges).toHaveLength(1)
    expect(moved.bridges[0].toLevelId).toBe(third.levelId)
    expect(canReach(moved, 'g', 'u')).toBe(true)
  })

  it('deleting the upper floor merges both sessions on the ground and drops the bridge', () => {
    const { document, ground, upstairs, levelId, id } = twoFloors()
    const result = bridgeSessions(document, ground.id, upstairs.id, id)
    if ('refused' in result) {
      throw new Error(result.refused)
    }
    const flattened = deleteLevel(result.document, levelId)
    expect(flattened.bridges).toEqual([])
    expect(flattened.root.nodes.filter((node) => node.content.kind === 'session')).toHaveLength(2)
  })
})
