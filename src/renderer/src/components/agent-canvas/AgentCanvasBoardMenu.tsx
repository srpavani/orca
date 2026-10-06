import React from 'react'
import { ClipboardPaste, FolderTree, Globe, Plus, Scroll, Type } from 'lucide-react'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import {
  CREATION_DEFAULT_SIZE,
  frameCenteredAt
} from '../../../../shared/spatial-canvas/creation-frame'
import type { CanvasPoint } from '../../../../shared/spatial-canvas/types'
import { CANVAS_TERMINAL_PRESETS } from './agent-canvas-create-terminal'
import { addCanvasFileTree, canAddCanvasFileTree } from './agent-canvas-file-tree-actions'
import { setPendingPlacement } from './agent-canvas-mode'
import { openNewTerminalSheet } from './agent-canvas-new-terminal'
import { addCanvasText, pasteCanvasClipboardAt } from './agent-canvas-node-actions'
import { addCanvasNote, resizeCanvasNode } from './agent-canvas-store'
import { TerminalWindowIcon } from './AgentCanvasIcons'

/**
 * The reference's CanvasContextMenu: Add ▸ (Terminal ▸ New Terminal… and the
 * presets, Note, File Tree, Portal, Text), then Paste. Every card is centred on
 * the right-clicked point at the tool's default size, like the reference's
 * frameForSize; a text block anchors its corner there.
 */
export function AgentCanvasBoardMenu(props: {
  at: CanvasPoint
  onAddPortal: (at: CanvasPoint) => void
  hasClipboard: boolean
}): React.JSX.Element {
  const { at } = props
  const frameFor = (kind: keyof typeof CREATION_DEFAULT_SIZE): ReturnType<typeof frameCenteredAt> =>
    frameCenteredAt(at, CREATION_DEFAULT_SIZE[kind])
  const newTerminal = (preset?: (typeof CANVAS_TERMINAL_PRESETS)[number]): void => {
    setPendingPlacement(frameFor('terminal'))
    openNewTerminalSheet(preset)
  }
  const place = (
    kind: 'note' | 'fileTree',
    create: (corner: CanvasPoint) => string | null
  ): void => {
    const frame = frameFor(kind)
    const id = create({ x: frame.x, y: frame.y })
    if (id !== null) {
      resizeCanvasNode(id, { width: frame.width, height: frame.height })
    }
  }
  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Plus className="size-3.5" />
          {translate('auto.components.agentCanvas.menuAdd', 'Add')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <TerminalWindowIcon className="size-3.5" />
              {translate('auto.components.agentCanvas.menuTerminal', 'Terminal')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onSelect={() => newTerminal()}>
                {translate('auto.components.agentCanvas.menuNewTerminal', 'New Terminal…')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              {CANVAS_TERMINAL_PRESETS.map((preset) => (
                <ContextMenuItem key={preset.label} onSelect={() => newTerminal(preset)}>
                  {preset.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onSelect={() => place('note', (corner) => addCanvasNote(corner))}>
            <Scroll className="size-3.5" />
            {translate('auto.components.agentCanvas.menuNote', 'Note')}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canAddCanvasFileTree()}
            onSelect={() => place('fileTree', addCanvasFileTree)}
          >
            <FolderTree className="size-3.5" />
            {translate('auto.components.agentCanvas.toolFileTree', 'File Tree')}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              const frame = frameFor('portal')
              props.onAddPortal({ x: frame.x, y: frame.y })
            }}
          >
            <Globe className="size-3.5" />
            {translate('auto.components.agentCanvas.toolPortal', 'Portal')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => addCanvasText(at)}>
            <Type className="size-3.5" />
            {translate('auto.components.agentCanvas.toolText', 'Text')}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!props.hasClipboard} onSelect={() => pasteCanvasClipboardAt(at)}>
        <ClipboardPaste className="size-3.5" />
        {translate('auto.components.agentCanvas.paste', 'Paste')}
      </ContextMenuItem>
    </>
  )
}
