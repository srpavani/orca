import { describe, expect, it } from 'vitest'
import { addNode, connectNodes, createDocument, createSessionNode, removeNode } from './document'
import { rebaseDocument } from './document-rebase'
import { everyEdge, everyNode } from './levels'

let next = 0
const id = (): string => `n${++next}`
const card = (sessionId: string) =>
  createSessionNode({ sessionId, label: sessionId, at: { x: 0, y: 0 }, id })

describe('rebaseDocument', () => {
  it('keeps a card and wire the host added while the user edited', () => {
    const lead = card('lead')
    const base = addNode(createDocument(), lead)
    const recruit = card('recruit')
    const host = connectNodes(addNode(base, recruit), lead.id, recruit.id, 'now', id)!.document
    const userNote = card('user-added')
    const local = addNode(base, userNote)
    const merged = rebaseDocument(local, base, host)
    expect(
      everyNode(merged)
        .map((node) => node.id)
        .sort()
    ).toEqual([lead.id, recruit.id, userNote.id].sort())
    expect(everyEdge(merged)).toHaveLength(1)
  })

  it('replaces the sync copy of a session with the card the host placed', () => {
    const base = createDocument()
    const placedByHost = card('tab-new')
    const host = addNode(base, placedByHost)
    const local = addNode(base, card('tab-new'))
    const merged = rebaseDocument(local, base, host)
    expect(everyNode(merged).map((node) => node.id)).toEqual([placedByHost.id])
  })

  it('applies host removals and keeps the user’s version of a card both changed', () => {
    const gone = card('gone')
    const kept = card('kept')
    const base = addNode(addNode(createDocument(), gone), kept)
    const host = removeNode(
      {
        ...base,
        root: {
          ...base.root,
          nodes: base.root.nodes.map((node) =>
            node.id === kept.id ? { ...node, zIndex: 9 } : node
          )
        }
      },
      gone.id
    )
    const local = {
      ...base,
      root: {
        ...base.root,
        nodes: base.root.nodes.map((node) => (node.id === kept.id ? { ...node, zIndex: 3 } : node))
      }
    }
    const merged = rebaseDocument(local, base, host)
    expect(everyNode(merged).map((node) => [node.id, node.zIndex])).toEqual([[kept.id, 3]])
  })
})
