import React from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Check,
  ClipboardCopy,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  FolderOpen,
  Group,
  LayoutGrid,
  LockOpen,
  PanelTopClose,
  PanelTopOpen,
  Pencil,
  SquareArrowOutUpRight,
  SquareDashed,
  Trash2,
  Ungroup
} from 'lucide-react'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import {
  minimumSelectionCount,
  type CanvasAlignment
} from '../../../../shared/spatial-canvas/aligned-frames'
import { supportsRedaction } from '../../../../shared/spatial-canvas/node-display'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import { absoluteTreePath } from './agent-canvas-file-ops'
import { anyNodeGrouped, groupNodes, ungroupNodes } from './agent-canvas-group-actions'
import {
  arrangeCanvasNodes,
  canvasActionTargets,
  canvasNodeHasContents,
  copyCanvasNodeContents,
  copyCanvasSelection,
  duplicateCanvasNode,
  renameCanvasNodeTo,
  setCanvasNodeLock,
  setCanvasNodesBlurred,
  toggleCanvasPortalChrome
} from './agent-canvas-node-actions'
import { openCanvasPrompt } from './agent-canvas-prompt'
import { requestCanvasRename } from './AgentCanvasRenamePopover'
import { removeCanvasNode } from './agent-canvas-store'
import { setCanvasSessionFlags } from './agent-canvas-document-setters'
import { AgentCanvasElementDefaultsItems } from './AgentCanvasCardKindItems'

type AlignEntry = {
  alignment: CanvasAlignment
  label: () => string
  Icon: typeof AlignStartVertical
}

/** The reference's ALIGN_MENU_GROUPS: horizontal, vertical, distribute. */
const ALIGN_MENU_GROUPS: readonly (readonly AlignEntry[])[] = [
  [
    {
      alignment: 'left',
      label: () => translate('auto.components.agentCanvas.alignLeft', 'Align Left'),
      Icon: AlignStartVertical
    },
    {
      alignment: 'centerHorizontally',
      label: () =>
        translate('auto.components.agentCanvas.centerHorizontally', 'Center Horizontally'),
      Icon: AlignCenterVertical
    },
    {
      alignment: 'right',
      label: () => translate('auto.components.agentCanvas.alignRight', 'Align Right'),
      Icon: AlignEndVertical
    }
  ],
  [
    {
      alignment: 'top',
      label: () => translate('auto.components.agentCanvas.alignTop', 'Align Top'),
      Icon: AlignStartHorizontal
    },
    {
      alignment: 'centerVertically',
      label: () => translate('auto.components.agentCanvas.centerVertically', 'Center Vertically'),
      Icon: AlignCenterHorizontal
    },
    {
      alignment: 'bottom',
      label: () => translate('auto.components.agentCanvas.alignBottom', 'Align Bottom'),
      Icon: AlignEndHorizontal
    }
  ],
  [
    {
      alignment: 'distributeHorizontally',
      label: () =>
        translate('auto.components.agentCanvas.distributeHorizontally', 'Distribute Horizontally'),
      Icon: AlignHorizontalDistributeCenter
    },
    {
      alignment: 'distributeVertically',
      label: () =>
        translate('auto.components.agentCanvas.distributeVertically', 'Distribute Vertically'),
      Icon: AlignVerticalDistributeCenter
    }
  ]
]

function cardName(node: CanvasNode): string {
  switch (node.content.kind) {
    case 'session':
      return node.content.name ?? node.content.label
    case 'note':
    case 'text':
      return node.content.pinnedName ?? ''
    case 'portal':
      return node.content.url
    case 'fileTree':
      return node.content.rootName
    case 'stack':
    case 'drawing':
    case 'bridge':
      return ''
  }
}

function RenameItem(props: { node: CanvasNode }): React.JSX.Element {
  const { node } = props
  // Why two routes: a terminal or portal names itself in its header, so Rename
  // opens that header's popover, as the reference does; a note's name has no
  // field of its own, so it gets the dialog.
  const inHeader = node.content.kind === 'session'
  return (
    <ContextMenuItem
      onSelect={() =>
        inHeader
          ? requestCanvasRename(node.id)
          : openCanvasPrompt({
              kind: 'text',
              title: translate('auto.components.agentCanvas.rename', 'Rename'),
              label: translate('auto.components.agentCanvas.renameLabel', 'Name'),
              confirmLabel: translate('auto.components.agentCanvas.rename', 'Rename'),
              initialValue: cardName(node),
              onSubmit: (value) => renameCanvasNodeTo(node.id, value)
            })
      }
    >
      <Pencil />
      {translate('auto.components.agentCanvas.rename', 'Rename')}
    </ContextMenuItem>
  )
}

function BlurItem(props: { node: CanvasNode; targets: readonly string[] }): React.JSX.Element {
  const blurred = props.node.redacted === true
  return (
    <ContextMenuItem onSelect={() => setCanvasNodesBlurred(props.targets, !blurred)}>
      {blurred ? <Eye /> : <EyeOff />}
      {blurred
        ? translate('auto.components.agentCanvas.removeBlur', 'Remove Blur')
        : translate('auto.components.agentCanvas.blur', 'Blur')}
    </ContextMenuItem>
  )
}

/**
 * The reference's ContextMenuCheckboxItem (Monitor Activity): the check sits in
 * the left gutter. The menu stays open on toggle, as a checkbox item does.
 */
function CheckItem(props: {
  checked: boolean
  label: string
  onToggle: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <ContextMenuItem
      role="menuitemcheckbox"
      aria-checked={props.checked}
      onSelect={(event) => {
        event.preventDefault()
        props.onToggle(!props.checked)
      }}
    >
      {props.checked ? <Check /> : <span aria-hidden className="size-3.5" />}
      {props.label}
    </ContextMenuItem>
  )
}
/** The kind-specific middle of the reference's NodeContextMenu. */
function KindItems(props: {
  node: CanvasNode
  targets: readonly string[]
}): React.JSX.Element | null {
  const { node, targets } = props
  const content = node.content
  if (content.kind === 'session') {
    return (
      <>
        <RenameItem node={node} />
        <CheckItem
          checked={content.watched !== false}
          label={translate('auto.components.agentCanvas.monitorActivity', 'Monitor Activity')}
          onToggle={(watched) => setCanvasSessionFlags(node.id, { watched })}
        />
        <CheckItem
          checked={content.isLead}
          label={translate('auto.components.agentCanvas.maestroMode', 'Maestro')}
          onToggle={(isLead) => setCanvasSessionFlags(node.id, { isLead })}
        />
        <ContextMenuSeparator />
        {supportsRedaction(content) ? <BlurItem node={node} targets={targets} /> : null}
        <AgentCanvasElementDefaultsItems node={node} />
        <ContextMenuSeparator />
      </>
    )
  }
  if (content.kind === 'note' || content.kind === 'text') {
    return (
      <>
        <RenameItem node={node} />
        <ContextMenuItem
          disabled={!canvasNodeHasContents(node.id)}
          onSelect={() => copyCanvasNodeContents(node.id)}
        >
          <ClipboardCopy />
          {translate('auto.components.agentCanvas.copyContents', 'Copy Contents')}
        </ContextMenuItem>
        {supportsRedaction(content) ? <BlurItem node={node} targets={targets} /> : null}
        <AgentCanvasElementDefaultsItems node={node} />
        <ContextMenuSeparator />
      </>
    )
  }
  if (content.kind === 'portal') {
    const hidden = content.chromeHidden === true
    return (
      <>
        <ContextMenuItem onSelect={() => toggleCanvasPortalChrome(node.id)}>
          {hidden ? <PanelTopOpen /> : <PanelTopClose />}
          {hidden
            ? translate('auto.components.agentCanvas.showChromeMenu', 'Show Chrome')
            : translate('auto.components.agentCanvas.hideChromeMenu', 'Hide Chrome')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void window.api.shell.openUrl(content.url)}>
          <SquareArrowOutUpRight />
          {translate('auto.components.agentCanvas.openInBrowser', 'Open in Browser')}
        </ContextMenuItem>
        <AgentCanvasElementDefaultsItems node={node} />
        <ContextMenuSeparator />
      </>
    )
  }
  if (content.kind === 'fileTree') {
    return (
      <>
        <ContextMenuItem
          onSelect={() => {
            const path = absoluteTreePath(content.worktreeId, '')
            if (path) {
              void window.api.shell.openInFileManager(path)
            }
          }}
        >
          <FolderOpen />
          {translate('auto.components.agentCanvas.showInFolder', 'Show in Folder')}
        </ContextMenuItem>
        <ContextMenuSeparator />
      </>
    )
  }
  return null
}

/**
 * The reference's NodeContextMenu, top to bottom: the arrangement block (Align
 * ▸, Tidy, Group, Ungroup — only when it applies), the card kind's own items,
 * then Copy Element, Duplicate, Lock and Delete.
 */
export function AgentCanvasCardMenu(props: { node: CanvasNode }): React.JSX.Element {
  const { node } = props
  const targets = canvasActionTargets(node.id)
  const movable = targets.length
  const canGroup = targets.length >= 2
  const canUngroup = anyNodeGrouped(targets)
  const locked = node.locked === true
  return (
    <>
      {movable >= 2 || canGroup || canUngroup ? (
        <>
          {movable >= 2 ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <AlignStartVertical />
                {translate('auto.components.agentCanvas.align', 'Align')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {ALIGN_MENU_GROUPS.map((group, index) => (
                  <React.Fragment key={group.map((item) => item.alignment).join('|')}>
                    {index > 0 ? <ContextMenuSeparator /> : null}
                    {group.map(({ alignment, label, Icon }) => (
                      <ContextMenuItem
                        key={alignment}
                        disabled={movable < minimumSelectionCount(alignment)}
                        onSelect={() => arrangeCanvasNodes(targets, alignment)}
                      >
                        <Icon />
                        {label()}
                      </ContextMenuItem>
                    ))}
                  </React.Fragment>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : null}
          {movable >= 2 ? (
            <ContextMenuItem onSelect={() => arrangeCanvasNodes(targets)}>
              <LayoutGrid />
              {translate('auto.components.agentCanvas.tidy', 'Tidy')}
            </ContextMenuItem>
          ) : null}
          {canGroup ? (
            <ContextMenuItem onSelect={() => groupNodes(targets)}>
              <Group />
              {translate('auto.components.agentCanvas.group', 'Group')}
            </ContextMenuItem>
          ) : null}
          {canUngroup ? (
            <ContextMenuItem onSelect={() => ungroupNodes(targets)}>
              <Ungroup />
              {translate('auto.components.agentCanvas.ungroup', 'Ungroup')}
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
        </>
      ) : null}
      <KindItems node={node} targets={targets} />
      <ContextMenuItem onSelect={() => copyCanvasSelection([node.id])}>
        <Copy />
        {translate('auto.components.agentCanvas.copyElement', 'Copy Element')}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={locked || node.content.kind === 'session'}
        onSelect={() => duplicateCanvasNode(node.id)}
      >
        <CopyPlus />
        {translate('auto.components.agentCanvas.duplicate', 'Duplicate')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => setCanvasNodeLock(node.id, !locked)}>
        {locked ? <LockOpen /> : <SquareDashed />}
        {locked
          ? translate('auto.components.agentCanvas.unlock', 'Unlock')
          : translate('auto.components.agentCanvas.lock', 'Lock')}
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onSelect={() => removeCanvasNode(node.id)}>
        <Trash2 />
        {translate('auto.components.agentCanvas.delete', 'Delete')}
      </ContextMenuItem>
    </>
  )
}
