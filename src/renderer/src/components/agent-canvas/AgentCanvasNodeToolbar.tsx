import React from 'react'
import {
  FolderOpen,
  GitBranch,
  PanelTopClose,
  PanelTopOpen,
  RotateCw,
  SquarePen,
  Trash2
} from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import { startCanvasConnect, useCanvasConnectingFrom } from './agent-canvas-connect-mode'
import { absoluteTreePath } from './agent-canvas-file-ops'
import { renameCanvasNodeTo, toggleCanvasPortalChrome } from './agent-canvas-node-actions'
import { openCanvasPrompt } from './agent-canvas-prompt'
import { removeCanvasNode } from './agent-canvas-store'
import { AgentCanvasConnectionsBadge } from './AgentCanvasConnectionsBadge'
import {
  AgentCanvasGlassButton,
  AgentCanvasGlassToolbar,
  AgentCanvasToolbarDivider
} from './AgentCanvasGlass'
import { requestCanvasPortalReload } from './AgentCanvasPortalBody'

function ConnectButton(props: {
  node: CanvasNode
  nodes: readonly CanvasNode[]
}): React.JSX.Element {
  const connecting = useCanvasConnectingFrom()
  return (
    <>
      <AgentCanvasGlassButton
        label={translate('auto.components.agentCanvas.connect', 'Connect')}
        active={connecting === props.node.id}
        onClick={() => startCanvasConnect(props.node.id)}
      >
        <GitBranch className="size-5" />
      </AgentCanvasGlassButton>
      <AgentCanvasConnectionsBadge node={props.node} nodes={props.nodes} />
    </>
  )
}

function DeleteButton(props: { node: CanvasNode; label: string }): React.JSX.Element {
  return (
    <AgentCanvasGlassButton
      label={props.label}
      className="text-destructive"
      onClick={() => removeCanvasNode(props.node.id)}
    >
      <Trash2 className="size-5" />
    </AgentCanvasGlassButton>
  )
}

function renameTerminal(node: CanvasNode): void {
  if (node.content.kind !== 'session') {
    return
  }
  openCanvasPrompt({
    kind: 'text',
    title: translate('auto.components.agentCanvas.editTerminal', 'Edit terminal'),
    label: translate('auto.components.agentCanvas.renameLabel', 'Name'),
    confirmLabel: translate('auto.components.agentCanvas.save', 'Save'),
    initialValue: node.content.name ?? node.content.label,
    onSubmit: (value) => renameCanvasNodeTo(node.id, value)
  })
}

const TOOLBAR = { 'data-canvas-node-toolbar': '' }

/**
 * The reference's ContextualToolbar, per card kind, with its icons and order:
 * - terminal: Edit (square-pen) | Connect (git-branch) + count | Delete
 * - portal: Reload (rotate-cw), Connect + count | Hide/Show chrome | Close portal
 * - note: Connect + count | Delete note
 * - file tree: Show in Folder (folder-open) | Delete file tree
 * The reference also offers Restart terminal, chat mode and the prompter; Orca
 * has none of those, so they are not shown.
 */
export function AgentCanvasNodeToolbar(props: {
  node: CanvasNode
  nodes: readonly CanvasNode[]
}): React.JSX.Element | null {
  const { node, nodes } = props
  const content = node.content
  if (content.kind === 'session') {
    return (
      <AgentCanvasGlassToolbar {...TOOLBAR}>
        <AgentCanvasGlassButton
          label={translate('auto.components.agentCanvas.editTerminal', 'Edit terminal')}
          onClick={() => renameTerminal(node)}
        >
          <SquarePen className="size-5" />
        </AgentCanvasGlassButton>
        <AgentCanvasToolbarDivider />
        <ConnectButton node={node} nodes={nodes} />
        <AgentCanvasToolbarDivider />
        <DeleteButton
          node={node}
          label={translate('auto.components.agentCanvas.deleteTerminal', 'Delete terminal')}
        />
      </AgentCanvasGlassToolbar>
    )
  }
  if (content.kind === 'portal') {
    const hidden = content.chromeHidden === true
    return (
      <AgentCanvasGlassToolbar {...TOOLBAR}>
        <AgentCanvasGlassButton
          label={translate('auto.components.agentCanvas.portalReloadShort', 'Reload')}
          onClick={() => requestCanvasPortalReload(node.id)}
        >
          <RotateCw className="size-5" />
        </AgentCanvasGlassButton>
        <ConnectButton node={node} nodes={nodes} />
        <AgentCanvasToolbarDivider />
        <AgentCanvasGlassButton
          label={
            hidden
              ? translate('auto.components.agentCanvas.portalShowChrome', 'Show chrome')
              : translate('auto.components.agentCanvas.portalHideChrome', 'Hide chrome')
          }
          active={hidden}
          onClick={() => toggleCanvasPortalChrome(node.id)}
        >
          {hidden ? <PanelTopOpen className="size-5" /> : <PanelTopClose className="size-5" />}
        </AgentCanvasGlassButton>
        <AgentCanvasToolbarDivider />
        <DeleteButton
          node={node}
          label={translate('auto.components.agentCanvas.closePortal', 'Close portal')}
        />
      </AgentCanvasGlassToolbar>
    )
  }
  if (content.kind === 'fileTree') {
    return (
      <AgentCanvasGlassToolbar
        {...TOOLBAR}
        role="group"
        aria-label={translate('auto.components.agentCanvas.fileTreeTools', 'File tree tools')}
      >
        <AgentCanvasGlassButton
          label={translate('auto.components.agentCanvas.showInFolder', 'Show in Folder')}
          onClick={() => {
            const path = absoluteTreePath(content.worktreeId, '')
            if (path) {
              void window.api.shell.openInFileManager(path)
            }
          }}
        >
          <FolderOpen className="size-5" />
        </AgentCanvasGlassButton>
        <AgentCanvasToolbarDivider />
        <DeleteButton
          node={node}
          label={translate('auto.components.agentCanvas.deleteFileTree', 'Delete file tree')}
        />
      </AgentCanvasGlassToolbar>
    )
  }
  if (content.kind === 'note' || content.kind === 'text') {
    return (
      <AgentCanvasGlassToolbar
        {...TOOLBAR}
        role="group"
        aria-label={translate('auto.components.agentCanvas.noteTools', 'Note tools')}
      >
        <ConnectButton node={node} nodes={nodes} />
        <AgentCanvasToolbarDivider />
        <DeleteButton
          node={node}
          label={translate('auto.components.agentCanvas.deleteNote', 'Delete note')}
        />
      </AgentCanvasGlassToolbar>
    )
  }
  return null
}
