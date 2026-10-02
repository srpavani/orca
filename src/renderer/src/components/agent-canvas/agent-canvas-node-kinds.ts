import type {
  CanvasFileTreeContent,
  CanvasNode,
  CanvasPortalContent
} from '../../../../shared/spatial-canvas/types'

export function isPortalNode(
  node: CanvasNode
): node is CanvasNode & { content: CanvasPortalContent } {
  return node.content.kind === 'portal'
}

export function isFileTreeNode(
  node: CanvasNode
): node is CanvasNode & { content: CanvasFileTreeContent } {
  return node.content.kind === 'fileTree'
}
