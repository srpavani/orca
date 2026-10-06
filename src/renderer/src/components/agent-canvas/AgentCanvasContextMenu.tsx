import React from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { screenToWorld } from '../../../../shared/spatial-canvas/geometry'
import { findNode } from '../../../../shared/spatial-canvas/levels'
import type { CanvasPoint } from '../../../../shared/spatial-canvas/types'
import { canvasActionTargets, canvasClipboard } from './agent-canvas-node-actions'
import { getAgentCanvasState, selectCanvasNodes } from './agent-canvas-store'
import { AgentCanvasBoardMenu } from './AgentCanvasBoardMenu'
import { AgentCanvasCardMenu } from './AgentCanvasCardMenu'
/** What the user right-clicked: the board, or one card on it. */
export type CanvasContextTarget = { nodeId: string | null; at: CanvasPoint }

export const EMPTY_CONTEXT_TARGET: CanvasContextTarget = {
  nodeId: null,
  at: { x: 0, y: 0 }
}

/**
 * The board's right-click menu. Right-clicking a card acts on that card (and on
 * any other selected cards), right-clicking the board acts on the floor — the
 * same split, and the same vocabulary, as the reference.
 *
 * Why the target is captured in state rather than passed at click time: the menu
 * is opened by Radix, and the handlers it composes run alongside ours, so the
 * target has to be recorded before the content renders.
 */
export function AgentCanvasContextMenu(props: {
  target: CanvasContextTarget
  onTargetChange: (target: CanvasContextTarget) => void
  onAddPortal: (at: CanvasPoint) => void
  children: React.ReactNode
}): React.JSX.Element {
  const { target } = props
  const node =
    target.nodeId === null ? null : findNode(getAgentCanvasState().document, target.nodeId)
  const hasClipboard = canvasClipboard() !== null
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="absolute inset-0"
          onContextMenu={(event) => {
            const element = (event.target as HTMLElement).closest('[data-canvas-node-id]')
            const bounds = event.currentTarget.getBoundingClientRect()
            const nodeId = element?.getAttribute('data-canvas-node-id') ?? null
            if (nodeId !== null) {
              selectCanvasNodes(canvasActionTargets(nodeId))
            }
            props.onTargetChange({
              nodeId,
              at: screenToWorld(
                { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
                getAgentCanvasState().viewport
              )
            })
          }}
        >
          {props.children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label={
          node
            ? translate('auto.components.agentCanvas.elementActions', 'Element actions')
            : translate('auto.components.agentCanvas.menuAdd', 'Add')
        }
      >
        {node ? (
          <AgentCanvasCardMenu node={node} />
        ) : (
          <AgentCanvasBoardMenu
            at={target.at}
            onAddPortal={props.onAddPortal}
            hasClipboard={hasClipboard}
          />
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
