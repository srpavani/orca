import { describe, expect, it } from 'vitest'
import {
  addNode,
  connectNodes,
  createDocument,
  createNoteNode,
  createSessionNode
} from './document'
import { everyNode } from './levels'
import { canvasSessionIdOf, repairSurfaceSessionIds } from './session-placement'

describe('canvasSessionIdOf', () => {
  it('cuts the leaf off a host surface id', () => {
    expect(canvasSessionIdOf('tab-1::leaf-9')).toBe('tab-1')
    expect(canvasSessionIdOf('tab-1')).toBe('tab-1')
  })
})

describe('repairSurfaceSessionIds', () => {
  it('rekeys a card saved with a surface id', () => {
    const card = createSessionNode({ sessionId: 'tab-1::leaf', label: 'A', at: { x: 0, y: 0 } })
    const fixed = repairSurfaceSessionIds(addNode(createDocument(), card))
    const node = everyNode(fixed)[0]
    expect(node.content.kind === 'session' && node.content.sessionId).toBe('tab-1')
  })

  it('merges the duplicate into the wired card and keeps its wires', () => {
    const synced = createSessionNode({ sessionId: 'tab-1', label: 'A', at: { x: 0, y: 0 } })
    const created = createSessionNode({ sessionId: 'tab-1::leaf', label: 'A', at: { x: 0, y: 0 } })
    const note = createNoteNode({ noteId: 'n', at: { x: 0, y: 0 } })
    let document = addNode(addNode(addNode(createDocument(), synced), created), note)
    document = connectNodes(document, created.id, note.id, 'now')!.document
    const fixed = repairSurfaceSessionIds(document)
    const sessions = everyNode(fixed).filter((node) => node.content.kind === 'session')
    expect(sessions.map((node) => node.id)).toEqual([created.id])
    expect(fixed.root.edges).toHaveLength(1)
  })

  it('leaves a clean document untouched', () => {
    const document = addNode(
      createDocument(),
      createSessionNode({ sessionId: 'tab-1', label: 'A', at: { x: 0, y: 0 } })
    )
    expect(repairSurfaceSessionIds(document)).toBe(document)
  })
})
