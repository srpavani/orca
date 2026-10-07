import { describe, expect, it } from 'vitest'
import { addNode, createDocument, createSessionNode } from '../../shared/spatial-canvas/document'
import { emptyAgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { findNode } from '../../shared/spatial-canvas/levels'
import { createConnectedNote, editConnectedNote } from './agent-canvas-note-ops'
import { resolveConnectedNote } from './agent-canvas-peers'

let next = 0
const id = (): string => `n${++next}`

function withCaller() {
  const caller = createSessionNode({ sessionId: 'me', label: 'Me', at: { x: 500, y: 100 }, id })
  return { ...emptyAgentCanvasSnapshot(), document: addNode(createDocument(), caller) }
}

describe('createConnectedNote', () => {
  it('puts a wired note left of the caller, readable at once', () => {
    const { snapshot, noteId } = createConnectedNote(
      withCaller(),
      'me',
      { body: 'hello', name: 'Plan' },
      'now',
      id
    )
    const note = resolveConnectedNote(snapshot, 'me', 'Plan')
    expect(note).toMatchObject({ noteId, displayName: 'Plan' })
    expect(snapshot.notes[noteId]).toBe('hello')
    const node = snapshot.document.root.nodes.find(
      (candidate) => candidate.content.kind === 'note'
    )!
    expect(node.frame.x + node.frame.width).toBeLessThan(500)
    expect(findNode(snapshot.document, node.id)).not.toBeNull()
  })
})

describe('editConnectedNote', () => {
  const seeded = () =>
    createConnectedNote(withCaller(), 'me', { body: 'a\n- [ ] tests\nb', name: 'Plan' }, 'now', id)

  it('replaces exactly one occurrence', () => {
    const { snapshot, noteId } = seeded()
    const edited = editConnectedNote(snapshot, 'me', 'Plan', '- [ ] tests', '- [x] tests')
    expect(edited.notes[noteId]).toBe('a\n- [x] tests\nb')
  })

  it('refuses a missing or repeated match', () => {
    const { snapshot } = seeded()
    expect(() => editConnectedNote(snapshot, 'me', 'Plan', 'zzz', 'y')).toThrow(
      expect.objectContaining({ code: 'canvas_note_edit_no_match' })
    )
    expect(() => editConnectedNote(snapshot, 'me', 'Plan', '\n', 'y')).toThrow(
      expect.objectContaining({ code: 'canvas_note_edit_no_match' })
    )
  })
})
