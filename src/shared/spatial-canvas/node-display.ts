/**
 * The per-card switches of the reference's menu that change how a card shows,
 * not what it is: Blur on terminals and notes, Hide chrome on portals. (The
 * reference's portal Mute is not here: its portal is a webview whose audio the
 * host can silence; Orca's is a sandboxed iframe, which a parent cannot mute.)
 */

import { mapAllLevels } from './document'
import type { CanvasDocument, CanvasNode, CanvasNodeContent, CanvasNodeId } from './types'

/** The reference blurs terminals and sticky notes only; the rest have nothing private to hide. */
export function supportsRedaction(content: CanvasNodeContent): boolean {
  return content.kind === 'session' || content.kind === 'note'
}

/** Applies `change` to the listed cards on every floor; returns `document` when nothing moved. */
function mapNodes(
  document: CanvasDocument,
  nodeIds: ReadonlySet<CanvasNodeId>,
  change: (node: CanvasNode) => CanvasNode
): CanvasDocument {
  let changed = false
  const next = mapAllLevels(document, (contents) => {
    let touched = false
    const nodes = contents.nodes.map((node) => {
      if (!nodeIds.has(node.id)) {
        return node
      }
      const updated = change(node)
      if (updated !== node) {
        touched = true
      }
      return updated
    })
    if (!touched) {
      return contents
    }
    changed = true
    return { ...contents, nodes }
  })
  return changed ? next : document
}

/**
 * Blurs or reveals cards. Applied to the whole selection like the reference,
 * skipping kinds it cannot blur. Revealing removes the flag rather than storing false.
 */
export function setCanvasNodesRedacted(
  document: CanvasDocument,
  nodeIds: readonly CanvasNodeId[],
  redacted: boolean
): CanvasDocument {
  return mapNodes(document, new Set(nodeIds), (node) => {
    if (!supportsRedaction(node.content) || (node.redacted === true) === redacted) {
      return node
    }
    if (redacted) {
      return { ...node, redacted: true }
    }
    const { redacted: _shown, ...rest } = node
    return rest
  })
}

export function canvasNodeRedacted(node: CanvasNode): boolean {
  return node.redacted === true && supportsRedaction(node.content)
}

export type CanvasPortalFlag = 'chromeHidden'

/** Flips one of a portal's display flags. Other kinds are left alone. */
export function toggleCanvasPortalFlag(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  flag: CanvasPortalFlag
): CanvasDocument {
  return mapNodes(document, new Set([nodeId]), (node) => {
    if (node.content.kind !== 'portal') {
      return node
    }
    const content = { ...node.content }
    if (content[flag] === true) {
      delete content[flag]
    } else {
      content[flag] = true
    }
    return { ...node, content }
  })
}

/**
 * Points a portal at a new page, from its address bar. The address is taken
 * as typed and normalized the way a new portal's is; anything that is not an
 * http(s) page leaves the portal where it was.
 */
export function setCanvasPortalUrl(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  url: string
): CanvasDocument {
  return mapNodes(document, new Set([nodeId]), (node) =>
    node.content.kind === 'portal' ? { ...node, content: { ...node.content, url } } : node
  )
}
