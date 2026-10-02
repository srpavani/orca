import React from 'react'
import { Loader2, Sparkles, SquareTerminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../../shared/tui-agent'
import {
  CANVAS_TERMINAL_PRESETS,
  createCanvasTerminal,
  type CanvasTerminalPreset
} from './agent-canvas-create-terminal'
import {
  closeNewTerminalSheet,
  useNewTerminalRequest,
  type NewTerminalRequest
} from './agent-canvas-new-terminal'
import { setCanvasSessionFlags } from './agent-canvas-store'

type Tab = 'details' | 'agent'

/**
 * New terminal, laid out like the reference's sheet: the quick-start row first,
 * then the tabs, then the two switches that say how the agent is treated —
 * Monitor activity (Sonar tells the user when it goes quiet) and Maestro (the
 * session may manage the board). Both are real settings on the card, not labels.
 */
export function AgentCanvasNewTerminalDialog(): React.JSX.Element | null {
  const request = useNewTerminalRequest()
  if (request === null) {
    return null
  }
  return <NewTerminalBody key={request.id} request={request} />
}

function NewTerminalBody(props: { request: NewTerminalRequest }): React.JSX.Element {
  const { request } = props
  const worktreeName = useAppStore((state) => {
    const id = state.activeWorktreeId
    if (id === null) {
      return ''
    }
    for (const list of Object.values(state.worktreesByRepo)) {
      const found = list.find((worktree) => worktree.id === id)
      if (found) {
        return found.displayName
      }
    }
    return ''
  })

  const [tab, setTab] = React.useState<Tab>('details')
  const [preset, setPreset] = React.useState<CanvasTerminalPreset>(
    request.presetAgent
      ? (CANVAS_TERMINAL_PRESETS.find((entry) => entry.agent === request.presetAgent) ??
          CANVAS_TERMINAL_PRESETS[0])
      : CANVAS_TERMINAL_PRESETS[0]
  )
  const [name, setName] = React.useState(request.presetLabel ?? '')
  const [command, setCommand] = React.useState('')
  const [cwd, setCwd] = React.useState('')
  const [prompt, setPrompt] = React.useState('')
  const [watched, setWatched] = React.useState(true)
  const [maestro, setMaestro] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  const browse = async (): Promise<void> => {
    const picked = await window.api.shell.pickDirectory(cwd ? { defaultPath: cwd } : {})
    if (picked) {
      setCwd(picked)
    }
  }

  const create = async (): Promise<void> => {
    setCreating(true)
    const created = await createCanvasTerminal({
      name,
      ...(preset.agent ? { agent: preset.agent as TuiAgent } : {}),
      ...(!preset.agent && command.trim() ? { command: command.trim() } : {}),
      ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
      ...(prompt.trim() ? { prompt: prompt.trim() } : {})
    })
    setCreating(false)
    if (!created) {
      return
    }
    if (created.nodeId !== null) {
      setCanvasSessionFlags(created.nodeId, { watched, isLead: maestro })
    }
    closeNewTerminalSheet()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          closeNewTerminalSheet()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.agentCanvas.newTerminalTitle', 'New terminal')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.agentCanvas.newTerminalDescription',
              'Create a new terminal on the canvas.'
            )}
          </DialogDescription>
        </DialogHeader>

        <QuickStart preset={preset} onPick={setPreset} />

        <Tabs tab={tab} onChange={setTab} />

        {tab === 'details' ? (
          <div className="flex flex-col gap-3">
            <Field label={translate('auto.components.agentCanvas.terminalName', 'Terminal name')}>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label={translate('auto.components.agentCanvas.command', 'Command')}>
              <Input
                value={command}
                disabled={preset.agent !== undefined}
                placeholder={translate(
                  'auto.components.agentCanvas.commandPlaceholder',
                  'e.g. claude, codex, or leave empty for a shell'
                )}
                onChange={(event) => setCommand(event.target.value)}
              />
            </Field>
            {/* Where it runs: the board creates into the active workspace, so this
                is a statement of fact rather than a choice — unlike the reference,
                which can target another workspace or floor. */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium">
                {translate('auto.components.agentCanvas.runsIn', 'Runs in')}
              </span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {worktreeName || translate('auto.components.agentCanvas.local', 'Local')}
              </span>
            </div>
            <Field
              label={translate('auto.components.agentCanvas.workingDirectory', 'Working directory')}
            >
              <div className="flex gap-2">
                <Input
                  value={cwd}
                  placeholder={translate(
                    'auto.components.agentCanvas.directoryPlaceholder',
                    'Workspace directory'
                  )}
                  onChange={(event) => setCwd(event.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => void browse()}>
                  {translate('auto.components.agentCanvas.browse', 'Browse…')}
                </Button>
              </div>
            </Field>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label={translate('auto.components.agentCanvas.agent', 'Agent')}>
              <span className="flex items-center gap-1.5 text-sm">
                <Sparkles className="size-3.5 text-muted-foreground" />
                {preset.label}
              </span>
            </Field>
            <Field label={translate('auto.components.agentCanvas.firstPrompt', 'First prompt')}>
              <Input
                value={prompt}
                placeholder={translate(
                  'auto.components.agentCanvas.firstPromptPlaceholder',
                  'Optional: what this agent should start with'
                )}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </Field>
          </div>
        )}

        <ToggleRow
          label={translate('auto.components.agentCanvas.monitorActivity', 'Monitor activity')}
          hint={translate(
            'auto.components.agentCanvas.monitorActivityHint',
            'Detects terminal output and tells you when the work finishes.'
          )}
          checked={watched}
          onCheckedChange={setWatched}
        />
        <ToggleRow
          label={translate('auto.components.agentCanvas.maestroMode', 'Maestro')}
          hint={translate(
            'auto.components.agentCanvas.maestroModeHint',
            'Lets this terminal manage the rest of the board.'
          )}
          checked={maestro}
          onCheckedChange={setMaestro}
        />

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={closeNewTerminalSheet}>
            {translate('auto.components.agentCanvas.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void create()} disabled={creating}>
            {creating ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.agentCanvas.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuickStart(props: {
  preset: CanvasTerminalPreset
  onPick: (preset: CanvasTerminalPreset) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        {translate('auto.components.agentCanvas.quickStart', 'Quick start')}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {CANVAS_TERMINAL_PRESETS.map((preset) => {
          const active = preset.label === props.preset.label
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => props.onPick(preset)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs',
                active
                  ? 'border-canvas-accent bg-canvas-accent-soft text-foreground'
                  : 'border-border text-muted-foreground hover:bg-foreground/5'
              )}
            >
              <SquareTerminal className="size-3.5" />
              {preset.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Tabs(props: { tab: Tab; onChange: (tab: Tab) => void }): React.JSX.Element {
  const items: { id: Tab; label: string }[] = [
    { id: 'details', label: translate('auto.components.agentCanvas.tabDetails', 'Details') },
    { id: 'agent', label: translate('auto.components.agentCanvas.tabAgent', 'Agent') }
  ]
  return (
    <div className="flex gap-1 border-b border-border">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => props.onChange(item.id)}
          className={cn(
            '-mb-px border-b-2 px-2 pb-1.5 text-xs',
            props.tab === item.id
              ? 'border-canvas-accent font-medium text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function Field(props: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{props.label}</span>
      {props.children}
      {props.hint ? <p className="text-xs text-muted-foreground">{props.hint}</p> : null}
    </div>
  )
}

function ToggleRow(props: {
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{props.label}</span>
        <span className="text-xs text-muted-foreground">{props.hint}</span>
      </div>
      <Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
    </div>
  )
}
