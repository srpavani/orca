import React from 'react'
import { ChevronRight, File, Folder, FolderOpen, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import {
  flattenFileTree,
  type FileTreeEntry,
  type FileTreeRow
} from '../../../../shared/spatial-canvas/file-tree'
import type { CanvasFileTreeContent, CanvasNode } from '../../../../shared/spatial-canvas/types'
import { toggleCanvasFileTreeFolder } from './agent-canvas-file-tree-actions'
import { AgentCanvasFileTreeMenu } from './AgentCanvasFileTreeMenu'

const LOCAL_RUNTIME = { kind: 'local' } as const
const ROW_HEIGHT = 22
const INDENT = 12

type Listing = { name: string; isDirectory: boolean }[]

/** Reads one folder of the worktree through Orca's own file explorer RPC. */
async function readFolder(worktreeId: string, relativePath: string): Promise<FileTreeEntry[]> {
  const listing = await callRuntimeRpc<Listing>(LOCAL_RUNTIME, 'files.readDir', {
    worktree: worktreeId,
    relativePath
  })
  return listing.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory }))
}

/**
 * The file tree card's body: the worktree's folders, opened in place. Listings
 * are fetched as folders open and are never written into the board; which
 * folders are open is, so the tree comes back the way it was left.
 */
export function AgentCanvasFileTreeBody(props: {
  node: CanvasNode & { content: CanvasFileTreeContent }
  interactive: boolean
}): React.JSX.Element {
  const { node } = props
  const { worktreeId } = node.content
  const expandedList = node.content.expanded
  const expanded = React.useMemo(() => new Set(expandedList ?? []), [expandedList])
  const [listings, setListings] = React.useState<Record<string, FileTreeEntry[]>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [reload, setReload] = React.useState(0)

  React.useEffect(() => {
    let live = true
    const wanted = ['', ...expanded].filter((path) => !(path in listings))
    if (wanted.length === 0) {
      return
    }
    void Promise.all(
      wanted.map(async (path) => [path, await readFolder(worktreeId, path)] as const)
    )
      .then((loaded) => {
        if (live) {
          setError(null)
          setListings((current) => ({ ...current, ...Object.fromEntries(loaded) }))
        }
      })
      .catch((cause: unknown) => {
        if (live) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })
    return () => {
      live = false
    }
    // Why `listings` is left out: it is what this effect fills, and re-running on
    // it would only find nothing left to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worktreeId, expanded, reload])

  const rows = flattenFileTree(listings, expanded)
  const refresh = (): void => {
    setListings({})
    setReload((value) => value + 1)
  }
  const [menuRow, setMenuRow] = React.useState<FileTreeRow | null>(null)

  const openFile = (path: string): void => {
    void callRuntimeRpc(LOCAL_RUNTIME, 'files.open', {
      worktree: worktreeId,
      relativePath: path
    }).catch(() => undefined)
  }

  return (
    <div className="flex size-full flex-col text-xs">
      <div className="flex shrink-0 items-center justify-end px-1 pt-0.5">
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={translate('auto.components.agentCanvas.fileTreeRefresh', 'Refresh')}
          title={translate('auto.components.agentCanvas.fileTreeRefresh', 'Refresh')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={refresh}
        >
          <RotateCw className="size-3" />
        </button>
      </div>
      <AgentCanvasFileTreeMenu
        worktreeId={worktreeId}
        row={menuRow}
        onChanged={refresh}
        onCreated={(folder) => {
          if (folder !== '' && !expanded.has(folder)) {
            toggleCanvasFileTreeFolder(node.id, folder)
          }
          refresh()
        }}
      >
        <div
          role="tree"
          onContextMenu={(event) => {
            event.stopPropagation()
            const item = (event.target as HTMLElement).closest<HTMLElement>('[data-tree-path]')
            const path = item?.dataset.treePath
            setMenuRow(rows.find((row) => row.path === path) ?? null)
          }}
          aria-label={node.content.rootName}
          className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto pb-1"
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          {error ? (
            <p className="p-2 text-destructive">{error}</p>
          ) : !('' in listings) ? (
            <p className="p-2 text-muted-foreground">
              {translate('auto.components.agentCanvas.fileTreeLoading', 'Loading files…')}
            </p>
          ) : rows.length === 0 ? (
            <p className="p-2 text-muted-foreground">
              {translate('auto.components.agentCanvas.fileTreeEmpty', 'This folder is empty.')}
            </p>
          ) : (
            rows.map((row) => (
              <button
                key={row.path}
                type="button"
                role="treeitem"
                data-tree-path={row.path}
                aria-expanded={row.isDirectory ? row.expanded : undefined}
                title={row.path}
                className={cn(
                  'flex w-full items-center gap-1 truncate pr-2 text-left hover:bg-foreground/5'
                )}
                style={{ height: ROW_HEIGHT, paddingLeft: 4 + row.depth * INDENT }}
                onClick={() => {
                  if (row.isDirectory) {
                    toggleCanvasFileTreeFolder(node.id, row.path)
                  }
                }}
                onDoubleClick={() => {
                  if (!row.isDirectory) {
                    openFile(row.path)
                  }
                }}
              >
                {row.isDirectory ? (
                  <ChevronRight
                    className={cn(
                      'size-3 shrink-0 transition-transform',
                      row.expanded && 'rotate-90'
                    )}
                  />
                ) : (
                  <span className="size-3 shrink-0" />
                )}
                {row.isDirectory ? (
                  row.expanded ? (
                    <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                  )
                ) : (
                  <File className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{row.name}</span>
              </button>
            ))
          )}
        </div>
      </AgentCanvasFileTreeMenu>
    </div>
  )
}
