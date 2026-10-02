import { describe, expect, it } from 'vitest'
import { bridgeBetween } from './bridges'
import {
  addNode,
  connectNodes,
  createDocument,
  createNoteNode,
  createSessionNode
} from './document'
import { createLevel } from './level-edits'
import { everyEdge, levelIdOfNode, sessionNode } from './levels'
import { canReach } from './reachability'
import { findLevelByName, placeRecruit } from './recruit'
import { syncSessionNodes } from './session-placement'
import type { CanvasDocument, CanvasNode } from './types'

function ids(): () => string {
  let next = 0
  return () => `id-${++next}`
}

const AT = { x: 0, y: 0 }

function withCaller(): { document: CanvasDocument; caller: CanvasNode; id: () => string } {
  const id = ids()
  const caller = createSessionNode({ sessionId: 'lead', label: 'Lead', at: AT, id })
  return { document: addNode(createDocument(), caller), caller, id }
}

describe('findLevelByName', () => {
  it('matches a floor by name, ignoring case, and the ground floor by "Ground"', () => {
    const { document, id } = withCaller()
    const floor = createLevel(document, { name: 'Experiment' }, id)
    expect(findLevelByName(floor.document, ' experiment ')).toBe(floor.levelId)
    expect(findLevelByName(floor.document, 'Ground')).toBeNull()
    expect(findLevelByName(floor.document, 'nope')).toBeUndefined()
  })
})

describe('placeRecruit', () => {
  it('places the recruit on the caller floor and wires it to the caller', () => {
    const { document, caller, id } = withCaller()
    const result = placeRecruit(document, {
      callerNodeId: caller.id,
      sessionId: 'recruit-1',
      label: 'Aurora',
      id
    })
    if ('refused' in result) {
      throw new Error(result.refused)
    }
    expect(result.bridged).toBe(false)
    expect(everyEdge(result.document)).toHaveLength(1)
    expect(canReach(result.document, 'lead', 'recruit-1')).toBe(true)
    // The label is pinned, so a title change cannot rename the recruit.
    const synced = syncSessionNodes(result.document, [
      { sessionId: 'recruit-1', label: 'claude', worktreeId: 'w' }
    ])
    expect(sessionNode(synced, 'recruit-1')?.content).toMatchObject({
      label: 'Aurora',
      name: 'Aurora'
    })
  })

  it('bridges the recruit when it lands on another floor, so it is still reachable', () => {
    const { document, caller, id } = withCaller()
    const floor = createLevel(document, { name: 'Experiment' }, id)
    const result = placeRecruit(floor.document, {
      callerNodeId: caller.id,
      sessionId: 'recruit-1',
      label: 'Aurora',
      levelId: floor.levelId,
      id
    })
    if ('refused' in result) {
      throw new Error(result.refused)
    }
    expect(result.bridged).toBe(true)
    expect(everyEdge(result.document)).toHaveLength(0)
    expect(bridgeBetween(result.document, caller.id, result.nodeId)).not.toBeNull()
    expect(canReach(result.document, 'lead', 'recruit-1')).toBe(true)
    expect(levelIdOfNode(result.document, result.nodeId)).toBe(floor.levelId)
  })

  it('stacks recruits instead of overlapping them', () => {
    const { document, caller, id } = withCaller()
    const first = placeRecruit(document, {
      callerNodeId: caller.id,
      sessionId: 'r1',
      label: 'A',
      id
    })
    if ('refused' in first) {
      throw new Error(first.refused)
    }
    const second = placeRecruit(first.document, {
      callerNodeId: caller.id,
      sessionId: 'r2',
      label: 'B',
      id
    })
    if ('refused' in second) {
      throw new Error(second.refused)
    }
    const a = sessionNode(second.document, 'r1')!
    const b = sessionNode(second.document, 'r2')!
    expect(a.frame.x === b.frame.x && a.frame.y === b.frame.y).toBe(false)
  })

  it.each([
    [
      'label-taken',
      (document: CanvasDocument, caller: CanvasNode) => ({ doc: document, caller, label: 'Lead' })
    ],
    [
      'caller-missing',
      (document: CanvasDocument, caller: CanvasNode) => ({
        doc: document,
        caller: { ...caller, id: 'ghost' },
        label: 'New'
      })
    ]
  ] as const)('refuses %s', (reason, build) => {
    const { document, caller, id } = withCaller()
    const built = build(document, caller)
    expect(
      placeRecruit(built.doc, {
        callerNodeId: built.caller.id,
        sessionId: 'r1',
        label: built.label,
        id
      })
    ).toEqual({ refused: reason })
  })

  it('refuses a caller that is not a session and an unknown floor', () => {
    const { document, id } = withCaller()
    const note = createNoteNode({ noteId: 'n', at: AT, id })
    const placed = addNode(document, note)
    expect(placeRecruit(placed, { callerNodeId: note.id, sessionId: 'r', label: 'R', id })).toEqual(
      { refused: 'caller-not-session' }
    )
    expect(
      placeRecruit(placed, {
        callerNodeId: placed.root.nodes[0].id,
        sessionId: 'r',
        label: 'R',
        levelId: 'missing-floor',
        id
      })
    ).toEqual({ refused: 'level-missing' })
  })

  it('wires a recruit onto a floor that already holds wired sessions', () => {
    const { document, caller, id } = withCaller()
    const other = createSessionNode({ sessionId: 'peer', label: 'Peer', at: AT, id })
    const created = createLevel(document, { name: 'F', branch: 'f' }, id)
    const floored = addNode(created.document, other, created.levelId)
    const result = placeRecruit(floored, {
      callerNodeId: caller.id,
      sessionId: 'r1',
      label: 'Aurora',
      levelId: created.levelId,
      id
    })
    if ('refused' in result) {
      throw new Error(result.refused)
    }
    const wired = connectNodes(
      result.document,
      result.nodeId,
      sessionNode(result.document, 'peer')!.id,
      'now',
      id
    )
    expect(wired).not.toBeNull()
    expect(canReach(wired!.document, 'r1', 'peer')).toBe(true)
  })
})
