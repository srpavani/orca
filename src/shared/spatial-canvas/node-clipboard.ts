/**
 * Copy and paste on the board.
 *
 * A clipboard is a snapshot of cards, not a reference to them: pasting after the
 * originals moved must not resurrect the old positions. Bodies ride along by id,
 * and paste hands back the remapped ids so the caller can store the text.
 */

import { createNode, newCanvasId, type CanvasIdFactory } from './document'
import { bodyIdsOf, findCanvasNode, mapCanvasLevel } from './node-ops'
import type {
  CanvasDocument,
  CanvasLevelId,
  CanvasNodeContent,
  CanvasNodeId,
  CanvasPoint
} from './types'

export type CanvasClipboardEntry = {
  content: CanvasNodeContent
  width: number
  height: number
  /** A blurred card pastes blurred: copying must not be a way to reveal it. */
  redacted?: true
}

/** What `Copy` puts aside, with the bodies the pasted cards need. */
export type CanvasClipboard = {
  entries: readonly CanvasClipboardEntry[]
  bodies: Record<string, string>
}

/**
 * Copies cards. A session card is deliberately not copyable: it points at one
 * live terminal, and a second card for the same terminal is not a second
 * terminal.
 */
export function copyCanvasNodes(
  document: CanvasDocument,
  nodeIds: readonly CanvasNodeId[],
  bodies: Record<string, string>
): CanvasClipboard | null {
  const entries: CanvasClipboardEntry[] = []
  const copiedBodies: Record<string, string> = {}
  for (const nodeId of nodeIds) {
    const found = findCanvasNode(document, nodeId)
    if (!found || found.node.content.kind === 'session') {
      continue
    }
    entries.push({
      content: found.node.content,
      width: found.node.frame.width,
      height: found.node.frame.height,
      ...(found.node.redacted === true ? { redacted: true as const } : {})
    })
    for (const bodyId of bodyIdsOf(found.node.content)) {
      if (bodyId in bodies) {
        copiedBodies[bodyId] = bodies[bodyId]
      }
    }
  }
  return entries.length === 0 ? null : { entries, bodies: copiedBodies }
}

/**
 * Pastes the clipboard at `at`, on `levelId`, with fresh ids for every card and
 * body. Returns the new node ids and the body text under its new id.
 */
export function pasteCanvasClipboard(input: {
  document: CanvasDocument
  clipboard: CanvasClipboard
  at: CanvasPoint
  levelId: CanvasLevelId
  id?: CanvasIdFactory
}): { document: CanvasDocument; nodeIds: CanvasNodeId[]; bodies: Record<string, string> } | null {
  const id = input.id ?? newCanvasId
  if (input.clipboard.entries.length === 0) {
    return null
  }
  const bodies: Record<string, string> = {}
  let document = input.document
  const nodeIds: CanvasNodeId[] = []
  for (const entry of input.clipboard.entries) {
    const content = withFreshBodyId(entry.content, id, input.clipboard.bodies, bodies)
    const created = createNode(
      content,
      { x: input.at.x, y: input.at.y, width: entry.width, height: entry.height },
      id
    )
    const node = entry.redacted ? { ...created, redacted: true } : created
    document = mapCanvasLevel(document, input.levelId, (contents) => ({
      ...contents,
      nodes: [...contents.nodes, node]
    }))
    nodeIds.push(node.id)
  }
  return { document, nodeIds, bodies }
}

function withFreshBodyId(
  content: CanvasNodeContent,
  id: CanvasIdFactory,
  bodies: Record<string, string>,
  out: Record<string, string>
): CanvasNodeContent {
  if (content.kind === 'note') {
    const noteId = id()
    out[noteId] = bodies[content.noteId] ?? ''
    return { ...content, noteId }
  }
  if (content.kind === 'text') {
    const textId = id()
    out[textId] = bodies[content.textId] ?? ''
    return { ...content, textId }
  }
  return content
}
