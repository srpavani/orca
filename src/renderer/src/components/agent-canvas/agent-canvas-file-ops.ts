import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { getConnectionId } from '@/lib/connection-context'
import {
  createRuntimePath,
  deleteRuntimePath,
  renameRuntimePath
} from '@/runtime/runtime-file-mutation-client'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import {
  fileNameProblem,
  joinTreePath,
  parentTreePath,
  type FileNameProblem
} from '../../../../shared/spatial-canvas/file-tree'
import { openCanvasPrompt } from './agent-canvas-prompt'

/**
 * The file tree's file operations, as the reference names them (New File, New
 * Folder, Rename, Move to Trash, Copy Path, Copy Relative Path). Every change
 * goes through Orca's own file-mutation client, so a local delete lands in the
 * Recycle Bin and a remote one follows Orca's SSH route.
 */

type FileTreeTarget = { worktreeId: string; path: string; isDirectory: boolean }

function worktreeRoot(worktreeId: string): string | null {
  return useAppStore.getState().getKnownWorktreeById(worktreeId)?.path ?? null
}

function context(worktreeId: string): RuntimeFileOperationArgs {
  return {
    settings: useAppStore.getState().settings,
    worktreeId,
    worktreePath: worktreeRoot(worktreeId),
    connectionId: getConnectionId(worktreeId) ?? undefined
  }
}

/** The absolute path of a tree entry, with the worktree's own separator. */
export function absoluteTreePath(worktreeId: string, relativePath: string): string | null {
  const root = worktreeRoot(worktreeId)
  if (root === null) {
    return null
  }
  const separator = root.includes('\\') ? '\\' : '/'
  const tail = relativePath.split('/').join(separator)
  return tail === '' ? root : `${root.replace(/[\\/]+$/, '')}${separator}${tail}`
}

function problemText(problem: FileNameProblem): string | null {
  switch (problem) {
    case 'empty':
      return null
    case 'illegal':
      return translate(
        'auto.components.agentCanvas.fileOpsIllegal',
        'A name cannot contain \\ / : < > " | ? *'
      )
    case 'reserved':
      return translate(
        'auto.components.agentCanvas.fileOpsReserved',
        'Windows reserves this name for a device.'
      )
  }
}

function validateName(value: string): string | null {
  const problem = fileNameProblem(value)
  return problem === null ? null : problemText(problem)
}

function reportFailure(cause: unknown): void {
  openCanvasPrompt({
    kind: 'notice',
    title: translate('auto.components.agentCanvas.fileOpsFailed', 'That did not work'),
    description: cause instanceof Error ? cause.message : String(cause),
    onSubmit: () => undefined
  })
}

/** Asks for a name, then creates a file or folder inside `folder` ('' is the root). */
export function promptCreateTreeEntry(
  worktreeId: string,
  folder: string,
  kind: 'file' | 'directory',
  onDone: (createdPath: string) => void
): void {
  const isFile = kind === 'file'
  openCanvasPrompt({
    kind: 'text',
    title: isFile
      ? translate('auto.components.agentCanvas.fileOpsNewFile', 'New File')
      : translate('auto.components.agentCanvas.fileOpsNewFolder', 'New Folder'),
    label: isFile
      ? translate('auto.components.agentCanvas.fileOpsNewFileField', 'Name of the new file')
      : translate('auto.components.agentCanvas.fileOpsNewFolderField', 'Name of the new folder'),
    initialValue: isFile
      ? translate('auto.components.agentCanvas.fileOpsNewFileName', 'Untitled')
      : translate('auto.components.agentCanvas.fileOpsNewFolderName', 'New Folder'),
    confirmLabel: translate('auto.components.agentCanvas.create', 'Create'),
    validate: validateName,
    onSubmit: (name) => {
      const relative = joinTreePath(folder, name.trim())
      const absolute = absoluteTreePath(worktreeId, relative)
      if (absolute === null) {
        return
      }
      createRuntimePath(context(worktreeId), absolute, kind).then(
        () => onDone(relative),
        reportFailure
      )
    }
  })
}

export function promptRenameTreeEntry(target: FileTreeTarget, onDone: () => void): void {
  const name = target.path.split('/').at(-1) ?? target.path
  openCanvasPrompt({
    kind: 'text',
    title: translate('auto.components.agentCanvas.fileOpsRename', 'Rename'),
    label: translate('auto.components.agentCanvas.fileOpsRenameField', 'New name for {{name}}', {
      name
    }),
    initialValue: name,
    confirmLabel: translate('auto.components.agentCanvas.fileOpsRename', 'Rename'),
    validate: (value) => (value.trim() === name ? '' : validateName(value)),
    onSubmit: (next) => {
      const from = absoluteTreePath(target.worktreeId, target.path)
      const to = absoluteTreePath(
        target.worktreeId,
        joinTreePath(parentTreePath(target.path), next)
      )
      if (from === null || to === null) {
        return
      }
      renameRuntimePath(context(target.worktreeId), from, to).then(onDone, reportFailure)
    }
  })
}

/** Confirms, then moves the entry to the Recycle Bin (the reference's Move to Trash). */
export function promptTrashTreeEntry(target: FileTreeTarget, onDone: () => void): void {
  const name = target.path.split('/').at(-1) ?? target.path
  openCanvasPrompt({
    kind: 'confirm',
    title: translate('auto.components.agentCanvas.fileOpsTrashTitle', 'Move to Trash?'),
    description: translate(
      'auto.components.agentCanvas.fileOpsTrashBody',
      '{{name}} will be moved to the Trash. You can restore it from there.',
      { name }
    ),
    confirmLabel: translate('auto.components.agentCanvas.fileOpsMoveToTrash', 'Move to Trash'),
    destructive: true,
    onSubmit: () => {
      const absolute = absoluteTreePath(target.worktreeId, target.path)
      if (absolute === null) {
        return
      }
      deleteRuntimePath(context(target.worktreeId), absolute, target.isDirectory).then(
        onDone,
        reportFailure
      )
    }
  })
}

export function copyTreePath(worktreeId: string, relativePath: string, absolute: boolean): void {
  const text = absolute ? absoluteTreePath(worktreeId, relativePath) : relativePath
  if (text !== null) {
    void window.api.ui.writeClipboardText(text)
  }
}
