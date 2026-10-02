import React from 'react'
import {
  ClipboardCopy,
  Eye,
  EyeOff,
  Group,
  PanelTopClose,
  PanelTopOpen,
  Settings2,
  Ungroup
} from 'lucide-react'
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import { elementDefaultChoices } from '../../../../shared/spatial-canvas/element-defaults'
import { useAgentCanvas } from './agent-canvas-store'
import { translate } from '@/i18n/i18n'
import { supportsRedaction } from '../../../../shared/spatial-canvas/node-display'
import type { CanvasNode, CanvasNodeId } from '../../../../shared/spatial-canvas/types'
import {
  canvasNodeHasContents,
  copyCanvasNodeContents,
  setCanvasNodesBlurred,
  toggleCanvasPortalChrome
} from './agent-canvas-node-actions'
import {
  adoptElementDefault,
  anyNodeGrouped,
  groupNodes,
  ungroupNodes
} from './agent-canvas-group-actions'

/**
 * The card-menu items that only some kinds carry, in the reference's terms:
 * Blur on terminals and notes (applied to the whole selection), Copy contents
 * on notes and text blocks, Hide chrome on portals.
 */
export function AgentCanvasCardKindItems(props: {
  node: CanvasNode
  targets: readonly CanvasNodeId[]
}): React.JSX.Element | null {
  const { node, targets } = props
  const items: React.ReactNode[] = []
  if (supportsRedaction(node.content)) {
    const blurred = node.redacted === true
    items.push(
      <ContextMenuItem key="blur" onSelect={() => setCanvasNodesBlurred(targets, !blurred)}>
        {blurred ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        {blurred
          ? translate('auto.components.agentCanvas.removeBlur', 'Remove blur')
          : translate('auto.components.agentCanvas.blur', 'Blur')}
      </ContextMenuItem>
    )
  }
  if (node.content.kind === 'note' || node.content.kind === 'text') {
    items.push(
      <ContextMenuItem
        key="copyContents"
        disabled={!canvasNodeHasContents(node.id)}
        onSelect={() => copyCanvasNodeContents(node.id)}
      >
        <ClipboardCopy className="size-3.5" />
        {translate('auto.components.agentCanvas.copyContents', 'Copy contents')}
      </ContextMenuItem>
    )
  }
  if (node.content.kind === 'portal') {
    const hidden = node.content.chromeHidden === true
    items.push(
      <ContextMenuItem key="chrome" onSelect={() => toggleCanvasPortalChrome(node.id)}>
        {hidden ? <PanelTopOpen className="size-3.5" /> : <PanelTopClose className="size-3.5" />}
        {hidden
          ? translate('auto.components.agentCanvas.showChrome', 'Show toolbar')
          : translate('auto.components.agentCanvas.hideChrome', 'Hide toolbar')}
      </ContextMenuItem>
    )
  }
  return items.length === 0 ? null : <>{items}</>
}

/**
 * Group / Ungroup, offered the way the reference offers them: Group when two or
 * more cards are targeted, Ungroup when any of them already sits in a group.
 */
export function AgentCanvasGroupItems(props: {
  targets: readonly CanvasNodeId[]
}): React.JSX.Element | null {
  const { targets } = props
  const canGroup = targets.length >= 2
  const canUngroup = anyNodeGrouped(targets)
  if (!canGroup && !canUngroup) {
    return null
  }
  return (
    <>
      {canGroup ? (
        <ContextMenuItem onSelect={() => groupNodes(targets)}>
          <Group className="size-3.5" />
          {translate('auto.components.agentCanvas.group', 'Group')}
        </ContextMenuItem>
      ) : null}
      {canUngroup ? (
        <ContextMenuItem onSelect={() => ungroupNodes(targets)}>
          <Ungroup className="size-3.5" />
          {translate('auto.components.agentCanvas.ungroup', 'Ungroup')}
        </ContextMenuItem>
      ) : null}
    </>
  )
}

/**
 * The reference's "New element defaults" submenu: adopt this card's size (and a
 * note's colour) for the cards created after it. Items that would change
 * nothing are disabled, as there.
 */
export function AgentCanvasElementDefaultsItems(props: {
  node: CanvasNode
}): React.JSX.Element | null {
  const defaults = useAgentCanvas((state) => state.document.elementDefaults) ?? {}
  const choices = elementDefaultChoices(props.node, defaults)
  if (choices.length === 0) {
    return null
  }
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Settings2 className="size-3.5" />
        {translate('auto.components.agentCanvas.newElementDefaults', 'New element defaults')}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-48">
        {choices.map((choice) => (
          <ContextMenuItem
            key={choice.kind}
            disabled={choice.current}
            onSelect={() => adoptElementDefault(choice)}
          >
            {choice.kind === 'size'
              ? translate('auto.components.agentCanvas.useThisSize', 'Use this size')
              : translate('auto.components.agentCanvas.useThisColor', 'Use this color')}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
