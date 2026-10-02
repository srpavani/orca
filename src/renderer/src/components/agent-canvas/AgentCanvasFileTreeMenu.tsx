import React from 'react'
import { Clipboard, FilePlus, FolderPlus, Link, Pencil, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { parentTreePath, type FileTreeRow } from '../../../../shared/spatial-canvas/file-tree'
import {
  copyTreePath,
  promptCreateTreeEntry,
  promptRenameTreeEntry,
  promptTrashTreeEntry
} from './agent-canvas-file-ops'

/**
 * The file tree's own menu, in the reference's order: New File and New Folder
 * (inside the folder clicked, or beside the file clicked, or at the root),
 * Rename and Move to Trash for the entry, then the two path copies.
 */
export function AgentCanvasFileTreeMenu(props: {
  worktreeId: string
  row: FileTreeRow | null
  onChanged: () => void
  onCreated: (folder: string) => void
  children: React.ReactNode
}): React.JSX.Element {
  const { worktreeId, row, onChanged, onCreated } = props
  const folder = row === null ? '' : row.isDirectory ? row.path : parentTreePath(row.path)
  const target = row === null ? null : { worktreeId, path: row.path, isDirectory: row.isDirectory }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{props.children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          onSelect={() =>
            promptCreateTreeEntry(worktreeId, folder, 'file', () => onCreated(folder))
          }
        >
          <FilePlus className="size-3.5" />
          {translate('auto.components.agentCanvas.fileOpsNewFile', 'New File')}…
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            promptCreateTreeEntry(worktreeId, folder, 'directory', () => onCreated(folder))
          }
        >
          <FolderPlus className="size-3.5" />
          {translate('auto.components.agentCanvas.fileOpsNewFolder', 'New Folder')}…
        </ContextMenuItem>
        {target !== null ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => promptRenameTreeEntry(target, onChanged)}>
              <Pencil className="size-3.5" />
              {translate('auto.components.agentCanvas.fileOpsRename', 'Rename')}…
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              onSelect={() => promptTrashTreeEntry(target, onChanged)}
            >
              <Trash2 className="size-3.5" />
              {translate('auto.components.agentCanvas.fileOpsMoveToTrash', 'Move to Trash')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => copyTreePath(worktreeId, target.path, true)}>
              <Clipboard className="size-3.5" />
              {translate('auto.components.agentCanvas.fileOpsCopyPath', 'Copy Path')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => copyTreePath(worktreeId, target.path, false)}>
              <Link className="size-3.5" />
              {translate(
                'auto.components.agentCanvas.fileOpsCopyRelativePath',
                'Copy Relative Path'
              )}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
