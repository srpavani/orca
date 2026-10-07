import React from 'react'
import { FolderGit2, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import { useCanvasProjectLinks } from './agent-canvas-project-links'

/**
 * Links from this card to agents in other projects, beside its wire badge. Why
 * visible and cuttable here: a link is a permission like a wire, so the user
 * must be able to see it and take it back on the card that holds it.
 */
export function AgentCanvasProjectLinksBadge(props: {
  node: CanvasNode
}): React.JSX.Element | null {
  const { links, remove } = useCanvasProjectLinks()
  const sessionId = props.node.content.kind === 'session' ? props.node.content.sessionId : null
  const mine = links.filter((link) => link.sessionId === sessionId)
  if (mine.length === 0) {
    return null
  }
  const title = translate('auto.components.agentCanvas.projectLinks', 'Other Projects')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          title={title}
          className="flex h-5 min-w-5 shrink-0 items-center justify-center gap-0.5 rounded-full border border-canvas-accent px-1 text-[10px] font-bold text-canvas-accent outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FolderGit2 className="size-3" aria-hidden />
          {mine.length}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="bottom"
        sideOffset={8}
        aria-label={title}
        className="w-64"
      >
        <h2 className="px-1 pb-1.5 text-[13px] font-semibold text-foreground">{title}</h2>
        <ul className="scrollbar-sleek flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {mine.map((link) => {
            const name = `${link.peer} @ ${link.project}`
            return (
              <li
                key={link.linkId}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-foreground/5"
              >
                <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                  {name}
                </span>
                <button
                  type="button"
                  aria-label={translate(
                    'auto.components.agentCanvas.removeConnectionTo',
                    'Remove connection to {{name}}',
                    { name }
                  )}
                  className="shrink-0 rounded p-0.5 text-muted-foreground outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => remove(link.linkId)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
