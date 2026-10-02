import React from 'react'
import { Copy, Globe, Plus, SquareTerminal, StickyNote, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { screenToWorld } from '../../../../shared/spatial-canvas/geometry'
import { findNode } from '../../../../shared/spatial-canvas/levels'
import type { CanvasPoint } from '../../../../shared/spatial-canvas/types'
import { CANVAS_TERMINAL_PRESETS } from './agent-canvas-create-terminal'
import { openNewTerminalSheet } from './agent-canvas-new-terminal'
import {
  addCanvasNote,
  getAgentCanvasState,
  removeCanvasNode,
  selectCanvasNodes
} from './agent-canvas-store'

/** What the user right-clicked: the board, or one card on it. */
export type CanvasContextTarget = { nodeId: string | null; at: CanvasPoint }

export const EMPTY_CONTEXT_TARGET: CanvasContextTarget = {
  nodeId: null,
  at: { x: 0, y: 0 }
}

/**
 * The board's right-click menu: what you can put on it, plus the little that can
 * be done to what is already there. Right-clicking a card acts on that card,
 * right-clicking the board acts on the floor.
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
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="absolute inset-0"
          onContextMenu={(event) => {
            const element = (event.target as HTMLElement).closest('[data-canvas-node-id]')
            const bounds = event.currentTarget.getBoundingClientRect()
            props.onTargetChange({
              nodeId: element?.getAttribute('data-canvas-node-id') ?? null,
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
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>
          {translate('auto.components.agentCanvas.boardMenu', 'Board')}
        </ContextMenuLabel>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus className="size-3.5" />
            {translate('auto.components.agentCanvas.add', 'Add')}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuItem onSelect={() => openNewTerminalSheet()}>
              <SquareTerminal className="size-3.5" />
              {translate('auto.components.agentCanvas.newTerminal', 'New terminal')}…
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Plus className="size-3.5" />
                {translate('auto.components.agentCanvas.quickStart', 'Quick start')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {CANVAS_TERMINAL_PRESETS.map((preset) => (
                  <ContextMenuItem key={preset.label} onSelect={() => openNewTerminalSheet(preset)}>
                    {preset.label}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem onSelect={() => addCanvasNote(target.at)}>
              <StickyNote className="size-3.5" />
              {translate('auto.components.agentCanvas.addNote', 'Note')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => props.onAddPortal(target.at)}>
              <Globe className="size-3.5" />
              {translate('auto.components.agentCanvas.addPortal', 'Portal')}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            const { document, activeLevelId } = getAgentCanvasState()
            const level =
              activeLevelId === null
                ? document.root
                : (document.levels.find((entry) => entry.id === activeLevelId) ?? document.root)
            selectCanvasNodes(level.nodes.map((entry) => entry.id))
          }}
        >
          <Copy className="size-3.5" />
          {translate('auto.components.agentCanvas.selectAll', 'Select all')}
        </ContextMenuItem>
        {node ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => removeCanvasNode(node.id)}>
              <Trash2 className="size-3.5" />
              {translate('auto.components.agentCanvas.removeNode', 'Remove from canvas')}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
