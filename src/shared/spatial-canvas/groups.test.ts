import { describe, expect, it } from 'vitest'
import { addNode, createDocument, createNoteNode, removeNode } from './document'
import {
  GROUP_PADDING,
  groupCanvasNodes,
  groupColorHex,
  groupFrame,
  groupOfNode,
  recolorCanvasGroup,
  renameCanvasGroup,
  ungroupCanvasNodes
} from './groups'
import type { CanvasDocument, CanvasNode } from './types'

function counterIds(): () => string {
  let next = 0
  return () => {
    next += 1
    return `g${next}`
  }
}

function withNodes(nodes: CanvasNode[]): CanvasDocument {
  return nodes.reduce((document, node) => addNode(document, node), createDocument())
}

const a = createNoteNode({ noteId: 'a', at: { x: 0, y: 0 } })
const b = createNoteNode({ noteId: 'b', at: { x: 500, y: 0 } })
const c = createNoteNode({ noteId: 'c', at: { x: 1000, y: 0 } })

describe('groupCanvasNodes', () => {
  it('groups two or more cards with an empty name and neutral colour', () => {
    const { document, groupId } = groupCanvasNodes(withNodes([a, b]), [a.id, b.id], counterIds())
    expect(groupId).toBe('g1')
    expect(document.root.groups).toEqual([
      { id: 'g1', nodeIds: [a.id, b.id], label: '', colorToken: '' }
    ])
  })

  it('does nothing for a single card', () => {
    const start = withNodes([a])
    expect(groupCanvasNodes(start, [a.id]).document).toBe(start)
  })

  it('adds cards to the one group their selection already shares', () => {
    const first = groupCanvasNodes(withNodes([a, b, c]), [a.id, b.id], counterIds()).document
    const { document, groupId } = groupCanvasNodes(first, [b.id, c.id], counterIds())
    expect(groupId).toBe('g1')
    expect(document.root.groups).toHaveLength(1)
    expect(document.root.groups[0]?.nodeIds.sort()).toEqual([a.id, b.id, c.id].sort())
  })

  it('starts a fresh group when the selection spans two groups, pruning the leftovers', () => {
    const d = createNoteNode({ noteId: 'd', at: { x: 1500, y: 0 } })
    const ids = counterIds()
    let document = groupCanvasNodes(withNodes([a, b, c, d]), [a.id, b.id], ids).document
    document = groupCanvasNodes(document, [c.id, d.id], ids).document
    const merged = groupCanvasNodes(document, [b.id, c.id], ids)
    expect(merged.groupId).toBe('g3')
    expect(merged.document.root.groups.map((group) => group.id)).toEqual(['g3'])
  })
})

describe('ungroupCanvasNodes', () => {
  it('dissolves a group that falls below two members', () => {
    const grouped = groupCanvasNodes(withNodes([a, b]), [a.id, b.id]).document
    expect(ungroupCanvasNodes(grouped, [a.id]).root.groups).toEqual([])
  })

  it('keeps a group that still has two members', () => {
    const grouped = groupCanvasNodes(withNodes([a, b, c]), [a.id, b.id, c.id]).document
    const next = ungroupCanvasNodes(grouped, [c.id])
    expect(next.root.groups[0]?.nodeIds).toEqual([a.id, b.id])
  })
})

describe('removing a grouped card', () => {
  it('dissolves the group when it would be left with one card', () => {
    const grouped = groupCanvasNodes(withNodes([a, b]), [a.id, b.id]).document
    expect(removeNode(grouped, a.id).root.groups).toEqual([])
  })
})

describe('name, colour and frame', () => {
  it('renames and recolours', () => {
    const { document, groupId } = groupCanvasNodes(withNodes([a, b]), [a.id, b.id])
    const renamed = renameCanvasGroup(document, null, groupId ?? '', '  Backend ')
    const recolored = recolorCanvasGroup(renamed, null, groupId ?? '', 'blue')
    expect(recolored.root.groups[0]).toMatchObject({ label: 'Backend', colorToken: 'blue' })
    expect(groupColorHex('blue')).toBe('#BBDEFB')
    expect(groupColorHex('')).toBeNull()
  })

  it('frames the members with the padding', () => {
    const { document } = groupCanvasNodes(withNodes([a, b]), [a.id, b.id])
    const group = document.root.groups[0]
    const frame = group ? groupFrame(document.root, group) : null
    expect(frame?.x).toBe(a.frame.x - GROUP_PADDING)
    expect(frame?.width).toBe(b.frame.x + b.frame.width - a.frame.x + GROUP_PADDING * 2)
    expect(groupOfNode(document.root, b.id)?.id).toBe(group?.id)
  })
})
