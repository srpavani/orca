import React from 'react'
import {
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowUpToLine,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Globe,
  Link2Off,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  SquareTerminal,
  StickyNote,
  Trash2,
  Type
} from 'lucide-react'
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
import type { CanvasAlign } from '../../../../shared/spatial-canvas/node-ops'
import type { CanvasNode, CanvasPoint } from '../../../../shared/spatial-canvas/types'
import {
  addCanvasText,
  arrangeCanvasNodes,
  canvasActionTargets,
  canvasClipboard,
  canvasNodeCanBeRenamed,
  copyCanvasSelection,
  disconnectCanvasNodeWires,
  duplicateCanvasNode,
  pasteCanvasClipboardAt,
  raiseCanvasNode,
  renameCanvasNodeTo,
  setCanvasNodeLock
} from './agent-canvas-node-actions'
import { AgentCanvasCardKindItems, AgentCanvasGroupItems } from './AgentCanvasCardKindItems'
import { CANVAS_TERMINAL_PRESETS } from './agent-canvas-create-terminal'
import { openNewTerminalSheet } from './agent-canvas-new-terminal'
import { openCanvasPrompt } from './agent-canvas-prompt'
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

const ALIGNMENTS: { align: CanvasAlign; label: () => string; Icon: typeof AlignStartVertical }[] = [
  {
    align: 'left',
    label: () => translate('auto.components.agentCanvas.alignLeft', 'Left'),
    Icon: AlignStartVertical
  },
  {
    align: 'centerX',
    label: () => translate('auto.components.agentCanvas.alignCenterX', 'Centre'),
    Icon: AlignCenterVertical
  },
  {
    align: 'right',
    label: () => translate('auto.components.agentCanvas.alignRight', 'Right'),
    Icon: AlignEndVertical
  },
  {
    align: 'top',
    label: () => translate('auto.components.agentCanvas.alignTop', 'Top'),
    Icon: ArrowUpToLine
  },
  {
    align: 'centerY',
    label: () => translate('auto.components.agentCanvas.alignCenterY', 'Middle'),
    Icon: AlignHorizontalSpaceAround
  },
  {
    align: 'bottom',
    label: () => translate('auto.components.agentCanvas.alignBottom', 'Bottom'),
    Icon: ArrowDownToLine
  }
]

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
      <ContextMenuContent className="w-56">
        {node ? (
          <CardMenu node={node} onAddPortal={props.onAddPortal} />
        ) : (
          <BoardMenu at={target.at} onAddPortal={props.onAddPortal} hasClipboard={hasClipboard} />
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Everything the board can do without a card under the pointer. */
function BoardMenu(props: {
  at: CanvasPoint
  onAddPortal: (at: CanvasPoint) => void
  hasClipboard: boolean
}): React.JSX.Element {
  return (
    <>
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
          <ContextMenuItem onSelect={() => addCanvasNote(props.at)}>
            <StickyNote className="size-3.5" />
            {translate('auto.components.agentCanvas.addNote', 'Note')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => addCanvasText(props.at)}>
            <Type className="size-3.5" />
            {translate('auto.components.agentCanvas.addText', 'Text')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => props.onAddPortal(props.at)}>
            <Globe className="size-3.5" />
            {translate('auto.components.agentCanvas.addPortal', 'Portal')}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem
        disabled={!props.hasClipboard}
        onSelect={() => pasteCanvasClipboardAt(props.at)}
      >
        <ClipboardPaste className="size-3.5" />
        {translate('auto.components.agentCanvas.paste', 'Paste')}
      </ContextMenuItem>
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
    </>
  )
}

/** Everything a card can do, in the reference's order. */
function CardMenu(props: {
  node: CanvasNode
  onAddPortal: (at: CanvasPoint) => void
}): React.JSX.Element {
  const { node } = props
  const targets = canvasActionTargets(node.id)
  const multiple = targets.length > 1
  const locked = node.locked === true
  const resizable = node.content.kind !== 'session'
  return (
    <>
      <ContextMenuLabel>
        <span className="block truncate">{cardMenuTitle(node)}</span>
      </ContextMenuLabel>
      <ContextMenuItem onSelect={() => copyCanvasSelection(targets)} disabled={!resizable}>
        <Copy className="size-3.5" />
        {translate('auto.components.agentCanvas.copyNode', 'Copy')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => duplicateCanvasNode(node.id)} disabled={!resizable}>
        <CopyPlus className="size-3.5" />
        {translate('auto.components.agentCanvas.duplicateNode', 'Duplicate')}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!canvasNodeCanBeRenamed(node.id)}
        onSelect={() => {
          openCanvasPrompt({
            kind: 'text',
            title: translate('auto.components.agentCanvas.renameTitle', 'Rename card'),
            label: translate('auto.components.agentCanvas.renameLabel', 'Name'),
            confirmLabel: translate('auto.components.agentCanvas.rename', 'Rename'),
            initialValue: cardMenuTitle(node),
            onSubmit: (value) => renameCanvasNodeTo(node.id, value)
          })
        }}
      >
        <Pencil className="size-3.5" />
        {translate('auto.components.agentCanvas.rename', 'Rename')}…
      </ContextMenuItem>
      <AgentCanvasCardKindItems node={node} targets={targets} />
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => raiseCanvasNode(node.id, 'front')}>
        <ArrowUpToLine className="size-3.5" />
        {translate('auto.components.agentCanvas.bringToFront', 'Bring to front')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => raiseCanvasNode(node.id, 'back')}>
        <ArrowDownToLine className="size-3.5" />
        {translate('auto.components.agentCanvas.sendToBack', 'Send to back')}
      </ContextMenuItem>
      <ContextMenuItem disabled={!multiple} onSelect={() => arrangeCanvasNodes(targets)}>
        <AlignHorizontalSpaceAround className="size-3.5" />
        {translate('auto.components.agentCanvas.tidy', 'Tidy')}
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={!multiple}>
          <AlignStartVertical className="size-3.5" />
          {translate('auto.components.agentCanvas.align', 'Align')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          {ALIGNMENTS.map(({ align, label, Icon }) => (
            <ContextMenuItem key={align} onSelect={() => arrangeCanvasNodes(targets, align)}>
              <Icon className="size-3.5" />
              {label()}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <AgentCanvasGroupItems targets={targets} />
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => disconnectCanvasNodeWires(node.id)}>
        <Link2Off className="size-3.5" />
        {translate('auto.components.agentCanvas.disconnectNode', 'Disconnect wires')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => setCanvasNodeLock(node.id, !locked)}>
        {locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
        {locked
          ? translate('auto.components.agentCanvas.unlock', 'Unlock')
          : translate('auto.components.agentCanvas.lock', 'Lock')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => removeCanvasNode(node.id)}>
        <Trash2 className="size-3.5" />
        {translate('auto.components.agentCanvas.removeNode', 'Remove from canvas')}
      </ContextMenuItem>
    </>
  )
}

/** The card's own name: the pinned name when it has one, else its kind. */
function cardMenuTitle(node: CanvasNode): string {
  switch (node.content.kind) {
    case 'session':
      return node.content.name ?? node.content.label
    case 'note':
      return (
        node.content.pinnedName ??
        translate('auto.components.agentCanvas.untitledNote', 'Untitled note')
      )
    case 'text':
      return (
        node.content.pinnedName ??
        translate('auto.components.agentCanvas.untitledText', 'Text block')
      )
    case 'portal':
      return node.content.url.replace(/^https?:\/\//, '')
    default:
      return translate('auto.components.agentCanvas.boardMenu', 'Board')
  }
}
