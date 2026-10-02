import React from 'react'
import { Cable } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { bridgeBetween } from '../../../../shared/spatial-canvas/bridges'
import { levelIdOfNode, levelsOf } from '../../../../shared/spatial-canvas/levels'
import type { CanvasDocument, CanvasNode } from '../../../../shared/spatial-canvas/types'
import { bridgeCanvasSessions } from './agent-canvas-level-actions'

/**
 * Lets a session card open a bridge to a session on another floor. Lists only
 * sessions that are not already bridged, grouped by floor; hidden when no
 * other floor has a session.
 */
export function AgentCanvasBridgeMenu(props: {
  document: CanvasDocument
  node: CanvasNode
}): React.JSX.Element | null {
  const { document, node } = props
  const here = levelIdOfNode(document, node.id)
  const floors = levelsOf(document)
    .filter((level) => level.id !== here)
    .map((level) => ({
      level,
      sessions: level.contents.nodes.filter(
        (candidate) =>
          candidate.content.kind === 'session' && !bridgeBetween(document, node.id, candidate.id)
      )
    }))
    .filter((entry) => entry.sessions.length > 0)
  if (floors.length === 0) {
    return null
  }
  const label = translate('auto.components.agentCanvas.bridgeTo', 'Bridge to another floor')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={label}
          title={label}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Cable className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {floors.map(({ level, sessions }, index) => (
          <React.Fragment key={level.id ?? 'ground'}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>
              {level.id === null
                ? translate('auto.components.agentCanvas.groundFloor', 'Ground')
                : level.name}
            </DropdownMenuLabel>
            {sessions.map((session) => (
              <DropdownMenuItem
                key={session.id}
                onSelect={() => bridgeCanvasSessions(node.id, session.id)}
              >
                {session.content.kind === 'session' ? session.content.label : session.id}
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
