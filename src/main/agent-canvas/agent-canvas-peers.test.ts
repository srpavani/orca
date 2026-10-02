import { describe, expect, it } from 'vitest'
import {
  addNode,
  connectNodes,
  createDocument,
  createNoteNode,
  createSessionNode
} from '../../shared/spatial-canvas/document'
import {
  emptyAgentCanvasSnapshot,
  type AgentCanvasSnapshot
} from '../../shared/spatial-canvas/agent-canvas-snapshot'
import type { CanvasNode } from '../../shared/spatial-canvas/types'
import {
  AgentCanvasAccessError,
  resolveConnectedNote,
  resolveConnectedPeer,
  viewPeers,
  writeConnectedNote
} from './agent-canvas-peers'

const AT = { x: 0, y: 0 }

function ids(): () => string {
  let next = 0
  return () => `n${++next}`
}

type Fixture = { snapshot: AgentCanvasSnapshot; nodes: Record<string, CanvasNode> }

/** Alpha—Beta wired, Gamma unwired; Alpha—plan note—detail note chained. */
function fixture(): Fixture {
  const id = ids()
  const nodes = {
    alpha: createSessionNode({ sessionId: 'tab-a', label: 'Alpha', at: AT, id }),
    beta: createSessionNode({ sessionId: 'tab-b', label: 'Beta', at: AT, id }),
    gamma: createSessionNode({ sessionId: 'tab-c', label: 'Gamma', at: AT, id }),
    plan: createNoteNode({ noteId: 'plan', at: AT, pinnedName: 'Plan', id }),
    detail: createNoteNode({ noteId: 'detail', at: AT, id }),
    locked: createNoteNode({ noteId: 'locked', at: AT, pinnedName: 'Locked', readOnly: true, id })
  }
  let document = createDocument()
  for (const node of Object.values(nodes)) {
    document = addNode(document, node)
  }
  const wire = (from: CanvasNode, to: CanvasNode): void => {
    const result = connectNodes(document, from.id, to.id, 'now', id)
    if (!result) {
      throw new Error('wire failed')
    }
    document = result.document
  }
  wire(nodes.alpha, nodes.beta)
  wire(nodes.beta, nodes.gamma)
  wire(nodes.alpha, nodes.plan)
  wire(nodes.plan, nodes.detail)
  wire(nodes.alpha, nodes.locked)
  return {
    nodes,
    snapshot: {
      ...emptyAgentCanvasSnapshot(),
      document,
      notes: { plan: 'step 1', detail: 'deep', locked: 'frozen' }
    }
  }
}

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof AgentCanvasAccessError) {
      return error.code
    }
    throw error
  }
  return 'no-error'
}

describe('viewPeers', () => {
  it('returns direct sessions only and the transitive note chain with bodies', () => {
    const view = viewPeers(fixture().snapshot, 'tab-a')
    expect(view.self.label).toBe('Alpha')
    expect(view.sessions.map((peer) => peer.label)).toEqual(['Beta'])
    expect(view.notes.map((note) => [note.noteId, note.depth, note.body])).toEqual([
      ['plan', 0, 'step 1'],
      ['locked', 0, 'frozen'],
      ['detail', 1, 'deep']
    ])
  })

  it('refuses a caller that is not on the canvas', () => {
    expect(codeOf(() => viewPeers(fixture().snapshot, 'tab-x'))).toBe('canvas_caller_not_on_canvas')
  })
})

describe('resolveConnectedPeer', () => {
  it('matches a wired peer by label case-insensitively or by session id', () => {
    const { snapshot } = fixture()
    expect(resolveConnectedPeer(snapshot, 'tab-a', '  beta ').sessionId).toBe('tab-b')
    expect(resolveConnectedPeer(snapshot, 'tab-a', 'tab-b').label).toBe('Beta')
  })

  it('is one hop only: a peer of a peer is not reachable', () => {
    expect(codeOf(() => resolveConnectedPeer(fixture().snapshot, 'tab-a', 'Gamma'))).toBe(
      'canvas_peer_not_connected'
    )
  })

  it('distinguishes an unknown name from an unwired one', () => {
    expect(codeOf(() => resolveConnectedPeer(fixture().snapshot, 'tab-a', 'Nobody'))).toBe(
      'canvas_peer_not_found'
    )
  })
})

describe('notes', () => {
  it('reads a chained note by id and by display name', () => {
    const { snapshot } = fixture()
    expect(resolveConnectedNote(snapshot, 'tab-a', 'detail').body).toBe('deep')
    expect(resolveConnectedNote(snapshot, 'tab-a', 'plan').body).toBe('step 1')
  })

  it('refuses notes that are not on the caller chain', () => {
    expect(codeOf(() => resolveConnectedNote(fixture().snapshot, 'tab-b', 'plan'))).toBe(
      'canvas_note_not_connected'
    )
  })

  it('appends and replaces, and refuses read-only notes', () => {
    const { snapshot } = fixture()
    const appended = writeConnectedNote(snapshot, 'tab-a', 'Plan', 'step 2', 'append')
    expect(appended.notes.plan).toBe('step 1\nstep 2')
    const replaced = writeConnectedNote(snapshot, 'tab-a', 'plan', 'fresh', 'replace')
    expect(replaced.notes.plan).toBe('fresh')
    expect(codeOf(() => writeConnectedNote(snapshot, 'tab-a', 'Locked', 'x', 'replace'))).toBe(
      'canvas_note_read_only'
    )
  })
})
