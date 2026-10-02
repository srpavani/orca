import React from 'react'
import { MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { everyNode } from '../../../../shared/spatial-canvas/levels'
import {
  buildResolvePrompt,
  type ResolveAgent
} from '../../../../shared/spatial-canvas/landing-resolve'
import { useAppStore } from '@/store'
import { agentStatusForNode } from './agent-canvas-card-status'
import { getAgentCanvasState } from './agent-canvas-store'

const T = 'auto.components.agentCanvas.landing.resolve'
const LOCAL_RUNTIME = { kind: 'local' } as const

/**
 * Session cards running an agent, wherever they sit. The reference lists only
 * terminals that launched an agent, and for a reason: the prompt is a short
 * transcript, so handing it to a bare shell would run `$ git checkout …` as
 * commands. Orca knows a pane hosts an agent when it reports a status for it.
 */
function canvasAgents(): ResolveAgent[] {
  const { terminalLayoutsByTabId, agentStatusByPaneKey } = useAppStore.getState()
  const agents: ResolveAgent[] = []
  for (const node of everyNode(getAgentCanvasState().document)) {
    if (node.content.kind !== 'session') {
      continue
    }
    if (!agentStatusForNode(node, terminalLayoutsByTabId, agentStatusByPaneKey)) {
      continue
    }
    agents.push({
      sessionId: node.content.sessionId,
      name: node.content.name ?? node.content.label
    })
  }
  return agents
}

/** Of those, only agents whose terminal is up: a stopped one cannot take the message. */
async function runningCanvasAgents(): Promise<ResolveAgent[]> {
  try {
    const listed = await callRuntimeRpc<{ terminals: { tabId: string; connected: boolean }[] }>(
      LOCAL_RUNTIME,
      'terminal.list',
      {}
    )
    const live = new Set(
      listed.terminals.filter((entry) => entry.connected).map((entry) => entry.tabId)
    )
    return canvasAgents().filter((agent) => live.has(agent.sessionId))
  } catch {
    return []
  }
}

/**
 * "Resolve code conflicts": the reference's popover on a conflicted landing. It
 * sends one agent the commands that reproduce the conflict, the conflicted
 * paths and an optional note, then closes; the agent does the merge.
 */
export function AgentCanvasResolveConflicts(props: {
  conflictFiles: readonly string[]
  sourceBranch: string
  targetBranch: string
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const [comment, setComment] = React.useState('')
  const [agentId, setAgentId] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)
  const [agents, setAgents] = React.useState<ResolveAgent[]>([])

  const onOpenChange = (next: boolean): void => {
    setOpen(next)
    if (!next) {
      return
    }
    setComment('')
    setSending(false)
    void runningCanvasAgents().then((listed) => {
      setAgents(listed)
      setAgentId((current) =>
        current !== null && listed.some((agent) => agent.sessionId === current)
          ? current
          : (listed[0]?.sessionId ?? null)
      )
    })
  }

  const send = (): void => {
    if (agentId === null || sending) {
      return
    }
    setSending(true)
    const prompt = buildResolvePrompt(
      props.sourceBranch,
      props.targetBranch,
      props.conflictFiles,
      comment
    )
    void callRuntimeRpc(LOCAL_RUNTIME, 'canvas.landingResolve', { sessionId: agentId, prompt })
      .then(() => setOpen(false))
      .catch((cause: unknown) => {
        setSending(false)
        toast.error(translate(`${T}.failed`, 'Could not send to the agent.'), {
          description: cause instanceof Error ? cause.message : String(cause)
        })
      })
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={translate(`${T}.title`, 'Resolve code conflicts')}
        >
          <MessageCircle className="size-3.5" />
          {translate(`${T}.title`, 'Resolve code conflicts')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-2 text-xs">
          <span className="font-semibold">{translate(`${T}.title`, 'Resolve code conflicts')}</span>
          {agents.length === 0 ? (
            <p className="text-muted-foreground">
              {translate(`${T}.noAgents`, 'No agents in this workspace to send to.')}
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">{translate(`${T}.agent`, 'Agent')}</span>
                <select
                  className="h-7 rounded-md border bg-transparent px-1.5"
                  value={agentId ?? ''}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  {agents.map((agent) => (
                    <option key={agent.sessionId} value={agent.sessionId}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                className="min-h-16 resize-none rounded-md border bg-transparent p-1.5 outline-none"
                placeholder={translate(`${T}.placeholder`, 'Add instructions (optional)')}
                aria-label={translate(`${T}.placeholder`, 'Add instructions (optional)')}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              <Button size="sm" disabled={agentId === null || sending} onClick={send}>
                {sending ? translate(`${T}.sending`, 'Sending...') : translate(`${T}.send`, 'Send')}
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
