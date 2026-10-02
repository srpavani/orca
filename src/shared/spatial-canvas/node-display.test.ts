import { describe, expect, it } from 'vitest'
import { addNode, createDocument, createNode, createNoteNode, createSessionNode } from './document'
import {
  canvasNodeRedacted,
  setCanvasNodesRedacted,
  supportsRedaction,
  toggleCanvasPortalFlag
} from './node-display'
import { copyCanvasNodes, pasteCanvasClipboard } from './node-clipboard'
import { findCanvasNode } from './node-ops'
import type { CanvasDocument, CanvasNode } from './types'

function withNodes(nodes: CanvasNode[]): CanvasDocument {
  return nodes.reduce((document, node) => addNode(document, node), createDocument())
}

const portal = createNode(
  { kind: 'portal', portalId: 'p1', url: 'http://localhost:3000' },
  { x: 0, y: 0, width: 600, height: 400 }
)

describe('redaction', () => {
  it('blurs terminals and notes, as the reference does', () => {
    const session = createSessionNode({ sessionId: 's1', label: 'One', at: { x: 0, y: 0 } })
    const note = createNoteNode({ noteId: 'n1', at: { x: 400, y: 0 } })
    const blurred = setCanvasNodesRedacted(withNodes([session, note]), [session.id, note.id], true)
    expect(blurred.root.nodes.every((node) => canvasNodeRedacted(node))).toBe(true)
  })

  it('leaves kinds it cannot blur untouched', () => {
    expect(supportsRedaction(portal.content)).toBe(false)
    const document = withNodes([portal])
    const next = setCanvasNodesRedacted(document, [portal.id], true)
    expect(findCanvasNode(next, portal.id)?.node.redacted).toBeUndefined()
  })

  it('drops the flag when revealed, rather than storing false', () => {
    const note = createNoteNode({ noteId: 'n1', at: { x: 0, y: 0 } })
    const blurred = setCanvasNodesRedacted(withNodes([note]), [note.id], true)
    const shown = setCanvasNodesRedacted(blurred, [note.id], false)
    expect('redacted' in (findCanvasNode(shown, note.id)?.node ?? {})).toBe(false)
  })
})

describe('portal flags', () => {
  it('shows the chrome again on a second toggle, dropping the flag', () => {
    const hidden = toggleCanvasPortalFlag(withNodes([portal]), portal.id, 'chromeHidden')
    const back = toggleCanvasPortalFlag(hidden, portal.id, 'chromeHidden')
    const restored = findCanvasNode(back, portal.id)?.node.content
    expect(restored?.kind === 'portal' && 'chromeHidden' in restored).toBe(false)
  })

  it('hides the chrome', () => {
    const hidden = toggleCanvasPortalFlag(withNodes([portal]), portal.id, 'chromeHidden')
    const content = findCanvasNode(hidden, portal.id)?.node.content
    expect(content?.kind === 'portal' && content.chromeHidden).toBe(true)
  })

  it('ignores a card that is not a portal', () => {
    const note = createNoteNode({ noteId: 'n1', at: { x: 0, y: 0 } })
    const document = withNodes([note])
    const next = toggleCanvasPortalFlag(document, note.id, 'chromeHidden')
    expect(findCanvasNode(next, note.id)?.node).toEqual(findCanvasNode(document, note.id)?.node)
  })
})

describe('copying a blurred card', () => {
  it('pastes it blurred, so copy is not a way to reveal it', () => {
    const note = createNoteNode({ noteId: 'n1', at: { x: 0, y: 0 } })
    const document = setCanvasNodesRedacted(withNodes([note]), [note.id], true)
    const clipboard = copyCanvasNodes(document, [note.id], { n1: 'secret' })
    const pasted = pasteCanvasClipboard({
      document,
      clipboard: clipboard ?? { entries: [], bodies: {} },
      at: { x: 100, y: 100 },
      levelId: null
    })
    expect(pasted?.document.root.nodes.at(-1)?.redacted).toBe(true)
  })
})
