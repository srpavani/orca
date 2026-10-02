import { describe, expect, it } from 'vitest'
import {
  addEdge,
  addNode,
  connectNodes,
  createDocument,
  createNoteNode,
  createSessionNode
} from './document'
import { canReach, directNeighbourIds, duplicateSessionLabel, reachableFrom } from './reachability'
import type { CanvasDocument, CanvasNode } from './types'

const AT = { x: 100, y: 100 }

function sequentialIds(): () => string {
  let next = 0
  return () => {
    next += 1
    return `id-${next}`
  }
}

function baseDocument(): {
  document: CanvasDocument
  a: CanvasNode
  b: CanvasNode
  note: CanvasNode
} {
  const ids = sequentialIds()
  const a = createSessionNode({ sessionId: 's-a', label: 'Alpha', at: AT, id: ids })
  const b = createSessionNode({ sessionId: 's-b', label: 'Beta', at: AT, id: ids })
  const note = createNoteNode({ noteId: 'n-1', at: AT, id: ids })
  let document = createDocument()
  document = addNode(document, a)
  document = addNode(document, b)
  document = addNode(document, note)
  return { document, a, b, note }
}

describe('reachableFrom', () => {
  it('sees nobody when the caller has no wires', () => {
    const { document } = baseDocument()
    const reach = reachableFrom(document, 's-a')
    expect(reach.self?.label).toBe('Alpha')
    expect(reach.sessions).toEqual([])
    expect(reach.notes).toEqual([])
  })

  it('sees a directly connected session', () => {
    const { document, a, b } = baseDocument()
    const connected = connectNodes(document, a.id, b.id, 'now')
    expect(connected).not.toBeNull()
    const reach = reachableFrom(connected!.document, 's-a')
    expect(reach.sessions.map((peer) => peer.label)).toEqual(['Beta'])
  })

  it('is symmetric: the edge grants reachability in both directions', () => {
    const { document, a, b } = baseDocument()
    const connected = connectNodes(document, a.id, b.id, 'now')!
    expect(reachableFrom(connected.document, 's-b').sessions.map((p) => p.label)).toEqual(['Alpha'])
  })

  it('does not walk two hops', () => {
    const ids = sequentialIds()
    const a = createSessionNode({ sessionId: 's-a', label: 'Alpha', at: AT, id: ids })
    const b = createSessionNode({ sessionId: 's-b', label: 'Beta', at: AT, id: ids })
    const c = createSessionNode({ sessionId: 's-c', label: 'Gamma', at: AT, id: ids })
    let document = createDocument()
    document = addNode(addNode(addNode(document, a), b), c)
    document = connectNodes(document, a.id, b.id, 'now')!.document
    document = connectNodes(document, b.id, c.id, 'now')!.document

    const reach = reachableFrom(document, 's-a')
    expect(reach.sessions.map((peer) => peer.label)).toEqual(['Beta'])
    expect(reach.sessions.some((peer) => peer.label === 'Gamma')).toBe(false)
  })

  it('returns an empty reach for a session that is not on the canvas', () => {
    const { document } = baseDocument()
    expect(reachableFrom(document, 'ghost')).toEqual({
      self: null,
      sessions: [],
      notes: [],
      portals: []
    })
  })

  it('never falls open to every node for an unknown caller', () => {
    const { document, a, b } = baseDocument()
    const connected = connectNodes(document, a.id, b.id, 'now')!
    expect(reachableFrom(connected.document, 'unknown').sessions).toEqual([])
  })

  it('carries the peer role and lead flag', () => {
    const ids = sequentialIds()
    const a = createSessionNode({ sessionId: 's-a', label: 'Alpha', at: AT, id: ids })
    const lead = createSessionNode({
      sessionId: 's-lead',
      label: 'Lead',
      at: AT,
      roleId: 'architect',
      isLead: true,
      id: ids
    })
    let document = addNode(addNode(createDocument(), a), lead)
    document = connectNodes(document, a.id, lead.id, 'now')!.document
    const [peer] = reachableFrom(document, 's-a').sessions
    expect(peer.roleId).toBe('architect')
    expect(peer.isLead).toBe(true)
  })
})

describe('note chains', () => {
  it('reaches a note wired to the caller at depth 0', () => {
    const { document, a, note } = baseDocument()
    const connected = connectNodes(document, a.id, note.id, 'now')!
    const reach = reachableFrom(connected.document, 's-a')
    expect(reach.notes.map((peer) => [peer.noteId, peer.depth])).toEqual([['n-1', 0]])
  })

  it('walks note-to-note edges transitively and reports depth', () => {
    const ids = sequentialIds()
    const a = createSessionNode({ sessionId: 's-a', label: 'Alpha', at: AT, id: ids })
    const first = createNoteNode({ noteId: 'n-1', at: AT, id: ids })
    const second = createNoteNode({ noteId: 'n-2', at: AT, id: ids })
    const third = createNoteNode({ noteId: 'n-3', at: AT, id: ids })
    let document = createDocument()
    for (const node of [a, first, second, third]) {
      document = addNode(document, node)
    }
    document = connectNodes(document, a.id, first.id, 'now')!.document
    document = connectNodes(document, first.id, second.id, 'now')!.document
    document = connectNodes(document, second.id, third.id, 'now')!.document

    const depths = new Map(reachableFrom(document, 's-a').notes.map((n) => [n.noteId, n.depth]))
    expect(depths.get('n-1')).toBe(0)
    expect(depths.get('n-2')).toBe(1)
    expect(depths.get('n-3')).toBe(2)
  })

  it('does not loop forever on a note cycle', () => {
    const ids = sequentialIds()
    const a = createSessionNode({ sessionId: 's-a', label: 'Alpha', at: AT, id: ids })
    const first = createNoteNode({ noteId: 'n-1', at: AT, id: ids })
    const second = createNoteNode({ noteId: 'n-2', at: AT, id: ids })
    let document = createDocument()
    for (const node of [a, first, second]) {
      document = addNode(document, node)
    }
    document = connectNodes(document, a.id, first.id, 'now')!.document
    document = connectNodes(document, first.id, second.id, 'now')!.document
    document = addEdge(document, {
      id: 'back',
      kind: 'note-note',
      createdAt: 'now',
      ropePoints: null,
      fromNodeId: second.id,
      toNodeId: first.id
    })
    expect(reachableFrom(document, 's-a').notes).toHaveLength(2)
  })

  it('surfaces a pinned note name and read-only flag', () => {
    const ids = sequentialIds()
    const a = createSessionNode({ sessionId: 's-a', label: 'Alpha', at: AT, id: ids })
    const note = createNoteNode({
      noteId: 'n-1',
      at: AT,
      pinnedName: 'Decisions',
      readOnly: true,
      id: ids
    })
    let document = addNode(addNode(createDocument(), a), note)
    document = connectNodes(document, a.id, note.id, 'now')!.document
    const [peer] = reachableFrom(document, 's-a').notes
    expect(peer.displayName).toBe('Decisions')
    expect(peer.readOnly).toBe(true)
  })
})

describe('directNeighbourIds', () => {
  it('reports both endpoints of every incident edge', () => {
    const { document, a, b, note } = baseDocument()
    let next = connectNodes(document, a.id, b.id, 'now')!.document
    next = connectNodes(next, a.id, note.id, 'now')!.document
    expect([...directNeighbourIds(next, a.id)].sort()).toEqual([b.id, note.id].sort())
  })

  it('crosses a bridge between levels', () => {
    const { document, a, b } = baseDocument()
    const bridged: CanvasDocument = {
      ...document,
      bridges: [
        {
          id: 'bridge-1',
          bridgeNodeId: a.id,
          fromNodeId: a.id,
          toNodeId: b.id,
          fromLevelId: null,
          toLevelId: 'level-2'
        }
      ]
    }
    expect(reachableFrom(bridged, 's-a').sessions.map((peer) => peer.label)).toEqual(['Beta'])
  })
})

describe('canReach', () => {
  it('is true only for a wired pair', () => {
    const { document, a, b } = baseDocument()
    expect(canReach(document, 's-a', 's-b')).toBe(false)
    const connected = connectNodes(document, a.id, b.id, 'now')!
    expect(canReach(connected.document, 's-a', 's-b')).toBe(true)
  })

  it('is false for an unknown session on either side', () => {
    const { document, a, b } = baseDocument()
    const connected = connectNodes(document, a.id, b.id, 'now')!
    expect(canReach(connected.document, 'ghost', 's-b')).toBe(false)
    expect(canReach(connected.document, 's-a', 'ghost')).toBe(false)
  })
})

describe('duplicateSessionLabel', () => {
  it('matches case-insensitively and ignores surrounding space', () => {
    const { document } = baseDocument()
    expect(duplicateSessionLabel(document, '  alpha ')).toBe(true)
    expect(duplicateSessionLabel(document, 'gamma')).toBe(false)
  })

  it('exempts the session being renamed', () => {
    const { document } = baseDocument()
    expect(duplicateSessionLabel(document, 'Alpha', 's-a')).toBe(false)
  })
})
