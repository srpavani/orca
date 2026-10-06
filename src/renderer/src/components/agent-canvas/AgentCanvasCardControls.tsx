import React from 'react'
import { Crown, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { CanvasNode, CanvasSessionContent } from '../../../../shared/spatial-canvas/types'
import { setCanvasSessionFlags } from './agent-canvas-document-setters'
import type { CardAgentState } from './agent-canvas-card-status'

/** Status colour per state. Sonar's own verdict lives in the store; this is the card's read of it. */
const STATE_CLASS: Record<CardAgentState, string> = {
  working: 'bg-status-success animate-pulse',
  blocked: 'bg-agent-question animate-pulse',
  waiting: 'bg-status-warning animate-pulse',
  done: 'bg-muted-foreground/40',
  unknown: 'bg-muted-foreground/25'
}

const STATE_LABEL: Record<CardAgentState, () => string> = {
  working: () => translate('auto.components.agentCanvas.stateWorking', 'Working'),
  blocked: () => translate('auto.components.agentCanvas.stateBlocked', 'Waiting for you'),
  waiting: () => translate('auto.components.agentCanvas.stateWaiting', 'Waiting'),
  done: () => translate('auto.components.agentCanvas.stateDone', 'Done'),
  unknown: () => translate('auto.components.agentCanvas.stateUnknown', 'No status yet')
}

/**
 * The card's agent controls: live status, Sonar (watch) and the lead crown.
 *
 * Lead is the manager gate — the equivalent of Maestri's Maestro Mode. Only the
 * user turns it on, and only a lead may recruit onto another floor or add
 * floors; an agent cannot crown itself.
 */
export function AgentCanvasCardControls(props: {
  node: CanvasNode & { content: CanvasSessionContent }
  state: CardAgentState
  live: boolean
}): React.JSX.Element {
  const { node, state, live } = props
  const watched = node.content.watched !== false
  const isLead = node.content.isLead
  const stateLabel = STATE_LABEL[state]()
  return (
    <>
      <span
        className={cn('relative size-2 shrink-0 rounded-full', STATE_CLASS[state])}
        title={
          live ? stateLabel : translate('auto.components.agentCanvas.sessionGone', 'Session closed')
        }
      />
      <button
        type="button"
        className={cn(
          'relative shrink-0 rounded p-0.5 hover:bg-foreground/10',
          watched ? 'opacity-70' : 'opacity-40'
        )}
        aria-pressed={watched}
        aria-label={translate(
          'auto.components.agentCanvas.sonarToggle',
          'Sonar: notify me when this agent goes quiet'
        )}
        title={translate(
          'auto.components.agentCanvas.sonarToggle',
          'Sonar: notify me when this agent goes quiet'
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setCanvasSessionFlags(node.id, { watched: !watched })}
      >
        {watched ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
      </button>
      <button
        type="button"
        className={cn(
          'relative shrink-0 rounded p-0.5 hover:bg-foreground/10',
          isLead ? 'text-annotation-highlight' : 'opacity-40'
        )}
        aria-pressed={isLead}
        aria-label={translate(
          'auto.components.agentCanvas.leadToggle',
          'Lead: allow this session to manage the board'
        )}
        title={translate(
          'auto.components.agentCanvas.leadToggle',
          'Lead: allow this session to manage the board'
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setCanvasSessionFlags(node.id, { isLead: !isLead })}
      >
        <Crown className="size-3" />
      </button>
    </>
  )
}
