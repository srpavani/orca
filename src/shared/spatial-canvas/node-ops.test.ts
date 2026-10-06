import { describe, expect, it } from 'vitest'
import {
  addNode,
  connectNodes,
  createDocument,
  createNoteNode,
  createSessionNode,
  createTextNode
} from './document'
import {
  alignCanvasNodes,
  bringCanvasNodeToFront,
  canvasNodeIsRenameable,
  canvasNodeLocked,
  disconnectCanvasNode,
  findCanvasNode,
  renameCanvasNode,
  sendCanvasNodeToBack,
  setCanvasNodeLocked,
  tidyCanvasNodes
} from './node-ops'
import { copyCanvasNodes, pasteCanvasClipboard } from './node-clipboard'
import type { CanvasDocument, CanvasNode } from './types'

/** Deterministic ids, so a paste's new ids are predictable in the assertions. */
function counterIds(prefix = 'id'): () => string {
  let next = 0
  return () => {
    next += 1
    return `${prefix}${next}`
  }
}

function withNodes(nodes: CanvasNode[]): CanvasDocument {
  return nodes.reduce((document, node) => addNode(document, node), createDocument())
}

describe('findCanvasNode', () => {
  it('finds a node and the level it lives on', () => {
    const node = createNoteNode({ noteId: 'n1', at: { x: 10, y: 20 } })
    const document = withNodes([node])
    expect(findCanvasNode(document, node.id)?.levelId).toBeNull()
    expect(findCanvasNode(document, node.id)?.node.frame.x).toBe(10)
    expect(findCanvasNode(document, 'missing')).toBeNull()
  })
})

describe('z-order', () => {
  const first = createNoteNode({ noteId: 'n1', at: { x: 0, y: 0 } })
  const second = createNoteNode({ noteId: 'n2', at: { x: 400, y: 0 } })
  const document = withNodes([first, second])

  it('raises a card above its neighbours', () => {
    const raised = bringCanvasNodeToFront(document, first.id)
    const z = findCanvasNode(raised, first.id)?.node.zIndex ?? 0
    const other = findCanvasNode(raised, second.id)?.node.zIndex ?? 0
    expect(z).toBeGreaterThan(other)
  })

  it('sends a card behind its neighbours', () => {
    const sent = sendCanvasNodeToBack(document, second.id)
    const z = findCanvasNode(sent, second.id)?.node.zIndex ?? 0
    expect(z).toBeLessThan(findCanvasNode(sent, first.id)?.node.zIndex ?? 0)
  })

  it('leaves an unknown node alone', () => {
    expect(bringCanvasNodeToFront(document, 'missing')).toBe(document)
    expect(sendCanvasNodeToBack(document, 'missing')).toBe(document)
  })
})

describe('disconnectCanvasNode', () => {
  it('drops the wires touching the card and keeps the card', () => {
    const left = createSessionNode({ sessionId: 's1', label: 'One', at: { x: 0, y: 0 } })
    const right = createSessionNode({ sessionId: 's2', label: 'Two', at: { x: 900, y: 0 } })
    const wired = connectNodes(withNodes([left, right]), left.id, right.id, '2026-01-01T00:00:00Z')
    expect(wired).not.toBeNull()
    const cut = disconnectCanvasNode(wired?.document ?? createDocument(), left.id)
    expect(cut.root.edges).toHaveLength(0)
    expect(cut.root.nodes).toHaveLength(2)
  })
})

describe('renameCanvasNode', () => {
  it('pins the name of a session without touching its terminal title', () => {
    const node = createSessionNode({ sessionId: 's1', label: 'Terminal 1', at: { x: 0, y: 0 } })
    const renamed = renameCanvasNode(withNodes([node]), node.id, '  Scout ')
    const content = findCanvasNode(renamed, node.id)?.node.content
    expect(content?.kind === 'session' ? content.name : null).toBe('Scout')
    expect(content?.kind === 'session' ? content.label : null).toBe('Terminal 1')
  })

  it('clears a pinned name when handed blank text', () => {
    const node = createNoteNode({ noteId: 'n1', at: { x: 0, y: 0 }, pinnedName: 'Old' })
    const renamed = renameCanvasNode(withNodes([node]), node.id, '   ')
    const content = findCanvasNode(renamed, node.id)?.node.content
    expect(content?.kind === 'note' ? content.pinnedName : 'x').toBeNull()
  })

  it('knows which kinds carry a name', () => {
    expect(canvasNodeIsRenameable(createNoteNode({ noteId: 'n1', at: { x: 0, y: 0 } }))).toBe(true)
    expect(canvasNodeIsRenameable(createTextNode({ textId: 't1', at: { x: 0, y: 0 } }))).toBe(true)
  })
})

describe('lock', () => {
  it('sets and clears the flag', () => {
    const node = createNoteNode({ noteId: 'n1', at: { x: 0, y: 0 } })
    const locked = setCanvasNodeLocked(withNodes([node]), node.id, true)
    const stored = findCanvasNode(locked, node.id)?.node
    expect(stored && canvasNodeLocked(stored)).toBe(true)
    const unlocked = setCanvasNodeLocked(locked, node.id, false)
    const back = findCanvasNode(unlocked, node.id)?.node
    expect(back && canvasNodeLocked(back)).toBe(false)
  })
})

describe('copy and paste', () => {
  it('copies a note with its body and pastes it under new ids', () => {
    const node = createNoteNode({ noteId: 'n1', at: { x: 10, y: 10 } })
    const document = withNodes([node])
    const clipboard = copyCanvasNodes(document, [node.id], { n1: 'hello' })
    expect(clipboard?.entries).toHaveLength(1)
    const pasted = pasteCanvasClipboard({
      document,
      clipboard: clipboard ?? { entries: [], bodies: {} },
      at: { x: 500, y: 500 },
      levelId: null,
      id: counterIds()
    })
    expect(pasted).not.toBeNull()
    expect(pasted?.document.root.nodes).toHaveLength(2)
    const copy = pasted?.document.root.nodes.at(-1)
    expect(copy?.content.kind === 'note' ? copy.content.noteId : null).toBe('id1')
    expect(copy?.id).toBe('id2')
    expect(copy?.frame.x).toBe(500)
    expect(pasted?.bodies).toEqual({ id1: 'hello' })
  })

  it('refuses to copy a session card, which is not a second terminal', () => {
    const node = createSessionNode({ sessionId: 's1', label: 'One', at: { x: 0, y: 0 } })
    expect(copyCanvasNodes(withNodes([node]), [node.id], {})).toBeNull()
  })

  it('pastes nothing from an empty clipboard', () => {
    expect(
      pasteCanvasClipboard({
        document: createDocument(),
        clipboard: { entries: [], bodies: {} },
        at: { x: 0, y: 0 },
        levelId: null
      })
    ).toBeNull()
  })

  it('keeps the copied size', () => {
    const node = createNoteNode({
      noteId: 'n1',
      at: { x: 0, y: 0 },
      size: { width: 500, height: 300 }
    })
    const document = withNodes([node])
    const clipboard = copyCanvasNodes(document, [node.id], {})
    const pasted = pasteCanvasClipboard({
      document,
      clipboard: clipboard ?? { entries: [], bodies: {} },
      at: { x: 0, y: 0 },
      levelId: null,
      id: counterIds('p')
    })
    expect(pasted?.document.root.nodes.at(-1)?.frame.width).toBe(500)
  })
})

describe('tidyCanvasNodes', () => {
  it('lays the cards out in a grid without overlapping', () => {
    const a = createNoteNode({ noteId: 'a', at: { x: 0, y: 0 } })
    const b = createNoteNode({ noteId: 'b', at: { x: 5, y: 5 } })
    const c = createNoteNode({ noteId: 'c', at: { x: 9, y: 9 } })
    const d = createNoteNode({ noteId: 'd', at: { x: 1, y: 1 } })
    const tidied = tidyCanvasNodes(withNodes([a, b, c, d]), [a.id, b.id, c.id, d.id])
    const frames = tidied.root.nodes.map((node) => node.frame)
    const keys = new Set(frames.map((frame) => `${frame.x}:${frame.y}`))
    expect(keys.size).toBe(4)
  })

  it('does nothing with fewer than two cards', () => {
    const a = createNoteNode({ noteId: 'a', at: { x: 0, y: 0 } })
    const document = withNodes([a])
    expect(tidyCanvasNodes(document, [a.id])).toBe(document)
  })
})

describe('alignCanvasNodes', () => {
  it('aligns on the left edge of the selection', () => {
    const a = createNoteNode({ noteId: 'a', at: { x: 100, y: 0 } })
    const b = createNoteNode({ noteId: 'b', at: { x: 400, y: 300 } })
    const aligned = alignCanvasNodes(withNodes([a, b]), [a.id, b.id], 'left')
    expect(aligned.root.nodes.every((node) => node.frame.x === 100)).toBe(true)
  })

  it('aligns on the vertical middle of the selection', () => {
    const a = createNoteNode({ noteId: 'a', at: { x: 0, y: 0 } })
    const b = createNoteNode({ noteId: 'b', at: { x: 0, y: 400 } })
    const aligned = alignCanvasNodes(withNodes([a, b]), [a.id, b.id], 'centerVertically')
    const centres = aligned.root.nodes.map((node) => node.frame.y + node.frame.height / 2)
    expect(centres[0]).toBeCloseTo(centres[1] ?? 0)
  })

  it('does nothing across floors', () => {
    const a = createNoteNode({ noteId: 'a', at: { x: 0, y: 0 } })
    const document = withNodes([a])
    expect(alignCanvasNodes(document, [a.id, 'missing'], 'left')).toBe(document)
  })
})
