/**
 * The file tree node's logic, independent of where the listing comes from.
 * Ordering is the reference's compareEntries: folders first, then a numeric,
 * accent-sensitive name compare (so `file2` sorts before `file10`).
 */

import { createNode, mapAllLevels, newCanvasId, type CanvasIdFactory } from './document'
import type {
  CanvasDocument,
  CanvasFileTreeContent,
  CanvasNode,
  CanvasNodeId,
  CanvasPoint
} from './types'

export const DEFAULT_FILE_TREE_SIZE = { width: 320, height: 420 } as const
/** The reference caps one directory read at 5000 entries; a tree row past that is noise. */
export const FILE_TREE_DIRECTORY_LIMIT = 5000

export type FileTreeEntry = { name: string; isDirectory: boolean }
export type FileTreeRow = {
  path: string
  name: string
  depth: number
  isDirectory: boolean
  expanded: boolean
}

export function compareFileTreeEntries(a: FileTreeEntry, b: FileTreeEntry): number {
  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1
  }
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'accent', numeric: true })
  return byName !== 0 ? byName : a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

export function sortFileTreeEntries(entries: readonly FileTreeEntry[]): FileTreeEntry[] {
  return entries.slice(0, FILE_TREE_DIRECTORY_LIMIT).toSorted(compareFileTreeEntries)
}

export function joinTreePath(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`
}

/**
 * Flattens the loaded part of the tree into the rows the node shows, depth
 * first. A folder's children appear only while it is expanded and loaded.
 */
export function flattenFileTree(
  listings: Readonly<Record<string, readonly FileTreeEntry[] | undefined>>,
  expanded: ReadonlySet<string>
): FileTreeRow[] {
  const rows: FileTreeRow[] = []
  const walk = (dir: string, depth: number): void => {
    for (const entry of sortFileTreeEntries(listings[dir] ?? [])) {
      const path = joinTreePath(dir, entry.name)
      const open = entry.isDirectory && expanded.has(path)
      rows.push({ path, name: entry.name, depth, isDirectory: entry.isDirectory, expanded: open })
      if (open) {
        walk(path, depth + 1)
      }
    }
  }
  walk('', 0)
  return rows
}

export function createFileTreeNode(input: {
  worktreeId: string
  rootName: string
  at: CanvasPoint
  id?: CanvasIdFactory
}): CanvasNode {
  return createNode(
    { kind: 'fileTree', worktreeId: input.worktreeId, rootName: input.rootName },
    { x: input.at.x, y: input.at.y, ...DEFAULT_FILE_TREE_SIZE },
    input.id ?? newCanvasId
  )
}

/** Opens or closes a folder; collapsing also forgets the folders opened inside it. */
export function toggleFileTreeFolder(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  path: string
): CanvasDocument {
  return mapAllLevels(document, (contents) => {
    if (!contents.nodes.some((node) => node.id === nodeId)) {
      return contents
    }
    return {
      ...contents,
      nodes: contents.nodes.map((node) => {
        if (node.id !== nodeId || node.content.kind !== 'fileTree') {
          return node
        }
        const current = node.content.expanded ?? []
        const open = current.includes(path)
        const expanded: string[] = open
          ? current.filter((entry) => entry !== path && !entry.startsWith(`${path}/`))
          : [...current, path]
        const content: CanvasFileTreeContent = { ...node.content, expanded }
        return { ...node, content }
      })
    }
  })
}

/** The reference's name rules (nameProblem): what a new or renamed entry may be called. */
const ILLEGAL_CHARACTERS = /[/\\:<>"|?*]/
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

export type FileNameProblem = 'empty' | 'illegal' | 'reserved'

export function fileNameProblem(raw: string): FileNameProblem | null {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return 'empty'
  }
  const hasControl = [...trimmed].some((character) => (character.codePointAt(0) ?? 32) < 32)
  if (ILLEGAL_CHARACTERS.test(trimmed) || hasControl) {
    return 'illegal'
  }
  const cleaned = trimmed.replace(/[. ]+$/, '')
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    return 'illegal'
  }
  if (WINDOWS_RESERVED.test(cleaned)) {
    return 'reserved'
  }
  return null
}

/** The folder an entry sits in, relative to the root ('' at the top). */
export function parentTreePath(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}
