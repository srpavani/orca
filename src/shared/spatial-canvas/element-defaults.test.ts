import { describe, expect, it } from 'vitest'
import { createNoteNode, createSessionNode } from './document'
import {
  adoptedSize,
  applyElementDefault,
  elementDefaultChoices,
  NOTE_SIZE_RANGE
} from './element-defaults'
import { createFileTreeNode } from './file-tree'

describe('adoptedSize', () => {
  it('snaps to the grid and clamps to the range', () => {
    expect(adoptedSize({ width: 333, height: 2000 }, NOTE_SIZE_RANGE)).toEqual({
      width: 340,
      height: 600
    })
    expect(adoptedSize({ width: 10, height: 10 }, NOTE_SIZE_RANGE)).toEqual({
      width: 100,
      height: 60
    })
  })
})

describe('elementDefaultChoices', () => {
  it('offers a note its size and colour, disabling what is already the default', () => {
    const note = createNoteNode({
      noteId: 'n',
      at: { x: 0, y: 0 },
      color: 'blue',
      size: { width: 400, height: 300 }
    })
    const choices = elementDefaultChoices(note, { noteSize: { width: 400, height: 300 } })
    expect(choices).toEqual([
      { kind: 'size', field: 'noteSize', size: { width: 400, height: 300 }, current: true },
      { kind: 'color', color: 'blue', current: false }
    ])
  })

  it('treats a note with no colour as yellow, the default colour', () => {
    const note = createNoteNode({ noteId: 'n', at: { x: 0, y: 0 } })
    expect(elementDefaultChoices(note, {}).at(-1)).toMatchObject({
      kind: 'color',
      color: 'yellow',
      current: true
    })
  })

  it('offers a session its size only, and other kinds nothing', () => {
    const session = createSessionNode({ sessionId: 's', label: 'a', at: { x: 0, y: 0 } })
    expect(elementDefaultChoices(session, {}).map((choice) => choice.kind)).toEqual(['size'])
    const tree = createFileTreeNode({ worktreeId: 'w', rootName: 'r', at: { x: 0, y: 0 } })
    expect(elementDefaultChoices(tree, {})).toEqual([])
  })
})

describe('applyElementDefault', () => {
  it('stores the adopted value under its own field', () => {
    const next = applyElementDefault({}, { kind: 'color', color: 'pink', current: false })
    expect(next).toEqual({ noteColor: 'pink' })
  })
})
