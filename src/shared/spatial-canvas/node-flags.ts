import { mapAllLevels } from './document'
import { levelsOf } from './levels'
import type {
  CanvasDocument,
  CanvasLevelContents,
  CanvasNode,
  CanvasNodeId,
  CanvasNoteColor,
  CanvasSessionContent
} from './types'

/** Session flags the user or a peer agent can flip on a canvas card. */
export type SessionFlagPatch = { watched?: boolean; isLead?: boolean; name?: string | null }

/**
 * Writes a session card's flags and reports whether anything changed, returning
 * the same document when nothing did so callers can skip persistence and
 * re-render. Lives here rather than in document.ts because it is about node
 * payloads, not about the document's structure.
 */
export function patchSessionFlags(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  patch: SessionFlagPatch
): CanvasDocument {
  return patchNodeContent(document, nodeId, (node) => {
    if (node.content.kind !== 'session') {
      return null
    }
    const next = { ...node.content, ...patch }
    if (
      next.watched === node.content.watched &&
      next.isLead === node.content.isLead &&
      next.name === node.content.name
    ) {
      return null
    }
    return next
  })
}

/** Recolours a sticky note. Paper colour is a property of the node, not of the level. */
export function setNoteColor(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  color: CanvasNoteColor
): CanvasDocument {
  return patchNodeContent(document, nodeId, (node) =>
    node.content.kind === 'note' && node.content.color !== color ? { ...node.content, color } : null
  )
}

/** Sessions Sonar watches: every session card except the ones the user muted. */
export function watchedSessions(
  document: CanvasDocument
): readonly { sessionId: string; label: string }[] {
  return levelsOf(document)
    .flatMap((level) => level.contents.nodes)
    .filter(
      (node): node is CanvasNode & { content: CanvasSessionContent } =>
        node.content.kind === 'session' && node.content.watched !== false
    )
    .map((node) => ({ sessionId: node.content.sessionId, label: node.content.label }))
}

/**
 * Applies `update` to one node's content; `update` returns null to mean "no
 * change", which keeps the document reference stable for the no-op path.
 */
function patchNodeContent(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  update: (node: CanvasNode) => CanvasNode['content'] | null
): CanvasDocument {
  let changed = false
  const next = mapAllLevels(document, (contents: CanvasLevelContents) => {
    const nodes = contents.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node
      }
      const content = update(node)
      if (content === null) {
        return node
      }
      changed = true
      return { ...node, content }
    })
    return changed ? { ...contents, nodes } : contents
  })
  return changed ? next : document
}
