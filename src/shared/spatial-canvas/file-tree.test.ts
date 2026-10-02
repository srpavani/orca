import { describe, expect, it } from 'vitest'
import { addNode, createDocument } from './document'
import {
  createFileTreeNode,
  flattenFileTree,
  sortFileTreeEntries,
  toggleFileTreeFolder
} from './file-tree'
import { findCanvasNode } from './node-ops'

describe('sortFileTreeEntries', () => {
  it('puts folders first, then names in numeric order', () => {
    const sorted = sortFileTreeEntries([
      { name: 'file10.ts', isDirectory: false },
      { name: 'src', isDirectory: true },
      { name: 'file2.ts', isDirectory: false },
      { name: 'Apps', isDirectory: true }
    ])
    expect(sorted.map((entry) => entry.name)).toEqual(['Apps', 'src', 'file2.ts', 'file10.ts'])
  })
})

describe('flattenFileTree', () => {
  const listings = {
    '': [
      { name: 'README.md', isDirectory: false },
      { name: 'src', isDirectory: true }
    ],
    src: [
      { name: 'main.ts', isDirectory: false },
      { name: 'lib', isDirectory: true }
    ],
    'src/lib': [{ name: 'util.ts', isDirectory: false }]
  }

  it('shows only the top level while nothing is open', () => {
    expect(flattenFileTree(listings, new Set()).map((row) => row.path)).toEqual([
      'src',
      'README.md'
    ])
  })

  it('nests the children of open folders, with depth', () => {
    const rows = flattenFileTree(listings, new Set(['src', 'src/lib']))
    expect(rows.map((row) => [row.path, row.depth])).toEqual([
      ['src', 0],
      ['src/lib', 1],
      ['src/lib/util.ts', 2],
      ['src/main.ts', 1],
      ['README.md', 0]
    ])
  })

  it('shows an open folder whose listing has not arrived as empty', () => {
    expect(flattenFileTree({ '': listings[''] }, new Set(['src'])).map((row) => row.path)).toEqual([
      'src',
      'README.md'
    ])
  })
})

describe('toggleFileTreeFolder', () => {
  it('opens a folder, and closing it forgets folders opened inside it', () => {
    const node = createFileTreeNode({ worktreeId: 'w1', rootName: 'repo', at: { x: 0, y: 0 } })
    let document = addNode(createDocument(), node)
    document = toggleFileTreeFolder(document, node.id, 'src')
    document = toggleFileTreeFolder(document, node.id, 'src/lib')
    const open = findCanvasNode(document, node.id)?.node.content
    expect(open?.kind === 'fileTree' ? open.expanded : null).toEqual(['src', 'src/lib'])
    document = toggleFileTreeFolder(document, node.id, 'src')
    const closed = findCanvasNode(document, node.id)?.node.content
    expect(closed?.kind === 'fileTree' ? closed.expanded : null).toEqual([])
  })
})
