import { describe, expect, it } from 'vitest'
import {
  addNode,
  connectNodes,
  createDocument,
  createNoteNode,
  createSessionNode
} from './document'
import {
  addDrawing,
  addPortal,
  createLevel,
  deleteLevel,
  moveNodeToLevel,
  normalizePortalUrl,
  renameLevel
} from './level-edits'
import { everyEdge, levelIdOfNode, levelsOf } from './levels'
import { reachableFrom } from './reachability'

function ids(): () => string {
  let next = 0
  return () => `id-${++next}`
}

const AT = { x: 10, y: 20 }

describe('levels', () => {
  it('creates, renames and keeps the ground level first', () => {
    const id = ids()
    const created = createLevel(
      createDocument(),
      { name: '  feature/x  ', branch: 'feature/x' },
      id
    )
    const renamed = renameLevel(created.document, created.levelId, 'Review floor')
    expect(levelsOf(renamed).map((level) => [level.id, level.name])).toEqual([
      [null, 'Ground'],
      [created.levelId, 'Review floor']
    ])
    expect(renamed.levels[0].branch).toBe('feature/x')
    expect(renameLevel(renamed, created.levelId, '   ')).toBe(renamed)
  })

  it('deleting a level rescues its sessions to the ground and drops the rest', () => {
    const id = ids()
    const { document: withLevel, levelId } = createLevel(createDocument(), { name: 'Floor 2' }, id)
    const session = createSessionNode({ sessionId: 's', label: 'S', at: AT, id })
    const note = createNoteNode({ noteId: 'n', at: AT, id })
    let document = addNode(addNode(withLevel, session, levelId), note, levelId)
    document = deleteLevel(document, levelId)
    expect(document.levels).toEqual([])
    expect(document.root.nodes.map((node) => node.id)).toEqual([session.id])
  })

  it('moving a node to another level drops its wires, revoking access across floors', () => {
    const id = ids()
    const a = createSessionNode({ sessionId: 'a', label: 'A', at: AT, id })
    const b = createSessionNode({ sessionId: 'b', label: 'B', at: AT, id })
    const wired = connectNodes(
      addNode(addNode(createDocument(), a), b),
      a.id,
      b.id,
      'now',
      id
    )!.document
    const { document: twoFloors, levelId } = createLevel(wired, { name: 'Up' }, id)
    const moved = moveNodeToLevel(twoFloors, b.id, levelId)
    expect(levelIdOfNode(moved, b.id)).toBe(levelId)
    expect(everyEdge(moved)).toEqual([])
    expect(reachableFrom(moved, 'a').sessions).toEqual([])
    expect(moveNodeToLevel(moved, b.id, levelId)).toBe(moved)
  })
})

describe('drawings and portals', () => {
  it('sizes a freehand drawing from its points and draws it behind cards', () => {
    const { document, node } = addDrawing(
      createDocument(),
      {
        type: 'freehand',
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 10 },
          { x: 25, y: 60 }
        ]
      },
      AT,
      null,
      ids()
    )
    expect(node.frame).toEqual({ x: 10, y: 20, width: 40, height: 60 })
    expect(document.root.nodes[0].zIndex).toBe(-1)
  })

  it('places a portal on the requested level', () => {
    const id = ids()
    const { document: floors, levelId } = createLevel(createDocument(), { name: 'Docs' }, id)
    const { document, node } = addPortal(floors, 'https://example.com/', AT, levelId, id)
    expect(levelIdOfNode(document, node.id)).toBe(levelId)
    expect(node.content).toMatchObject({ kind: 'portal', url: 'https://example.com/' })
  })

  it.each([
    ['localhost:3000', 'https://localhost:3000/'],
    ['http://127.0.0.1:5173/app', 'http://127.0.0.1:5173/app'],
    ['javascript:alert(1)', null],
    ['file:///etc/passwd', null],
    ['', null]
  ])('normalizes portal url %j', (raw, expected) => {
    expect(normalizePortalUrl(raw)).toBe(expected)
  })
})
