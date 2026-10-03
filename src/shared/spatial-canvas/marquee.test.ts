import { describe, expect, it } from 'vitest'
import { addNode, createDocument, createNoteNode } from './document'
import { createLevel } from './level-edits'
import { levelContents } from './levels'
import { combineSelection, dragSet, draggedPositions, marqueeHits, rectBetween } from './marquee'

const a = createNoteNode({ noteId: 'a', at: { x: 0, y: 0 } })
const b = createNoteNode({ noteId: 'b', at: { x: 1000, y: 0 } })
const c = createNoteNode({ noteId: 'c', at: { x: 0, y: 1000 } })

describe('rectBetween', () => {
  it('normalises a drag in any direction', () => {
    expect(rectBetween({ x: 10, y: 50 }, { x: 0, y: 20 })).toEqual({
      x: 0,
      y: 20,
      width: 10,
      height: 30
    })
  })
})

describe('marqueeHits', () => {
  it('picks cards the rectangle touches, even partly', () => {
    const doc = [a, b, c].reduce((d, n) => addNode(d, n), createDocument())
    expect(marqueeHits(doc.root, { x: -10, y: -10, width: 1100, height: 50 })).toEqual([a.id, b.id])
  })

  it('skips locked cards', () => {
    const doc = [{ ...a, locked: true }, b].reduce((d, n) => addNode(d, n), createDocument())
    expect(marqueeHits(doc.root, { x: -10, y: -10, width: 2000, height: 50 })).toEqual([b.id])
  })

  it('only sees the floor it is given, never cards on other floors', () => {
    const { document: withFloor, levelId } = createLevel(createDocument(), {
      name: 'f',
      branch: null
    })
    const doc = addNode(addNode(withFloor, a), b, levelId)
    const ground = levelContents(doc, null) ?? doc.root
    expect(marqueeHits(ground, { x: -10, y: -10, width: 2000, height: 50 })).toEqual([a.id])
  })
})

describe('combineSelection', () => {
  it('replaces without shift and adds without repeats with shift', () => {
    expect(combineSelection(['x'], ['y'], false)).toEqual(['y'])
    expect(combineSelection(['x', 'y'], ['y', 'z'], true)).toEqual(['x', 'y', 'z'])
  })
})

describe('dragSet', () => {
  const doc = [a, b, { ...c, locked: true }].reduce((d, n) => addNode(d, n), createDocument())

  it('carries the whole selection when the grabbed card is in it', () => {
    expect([...dragSet(doc.root, a.id, [a.id, b.id]).keys()]).toEqual([a.id, b.id])
  })

  it('moves only the grabbed card when it is not selected', () => {
    expect([...dragSet(doc.root, a.id, [b.id]).keys()]).toEqual([a.id])
  })

  it('leaves locked cards behind', () => {
    expect([...dragSet(doc.root, a.id, [a.id, c.id]).keys()]).toEqual([a.id])
  })

  it('moves every card by the same delta', () => {
    const moved = draggedPositions(dragSet(doc.root, a.id, [a.id, b.id]), { x: 5, y: -5 })
    expect(moved.get(a.id)).toEqual({ x: 5, y: -5 })
    expect(moved.get(b.id)).toEqual({ x: 1005, y: -5 })
  })
})
