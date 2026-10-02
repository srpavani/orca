import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { newCanvasId } from '../../../../shared/spatial-canvas/document'
import {
  documentHooks,
  FLOOR_HOOK_ENVIRONMENT_VARIABLES,
  formatHookCommands,
  parseHookCommands,
  type FloorHookSection,
  type WorkspaceHooks
} from '../../../../shared/spatial-canvas/floor-hooks'
import { translate } from '@/i18n/i18n'
import { closeFloorHooksSheet, useFloorHooksSheetOpen } from './agent-canvas-floor-hooks-sheet'
import { setCanvasHooks, useAgentCanvas } from './agent-canvas-store'

const SECTION_LABELS: Record<FloorHookSection, () => string> = {
  setup: () => translate('auto.components.agentCanvas.hooksSetup', 'Setup'),
  run: () => translate('auto.components.agentCanvas.hooksRun', 'Run'),
  teardown: () => translate('auto.components.agentCanvas.hooksTeardown', 'Teardown')
}

const SECTION_HINTS: Record<FloorHookSection, () => string> = {
  setup: () =>
    translate('auto.components.agentCanvas.hooksSetupHint', 'Runs when a floor is created.'),
  run: () => translate('auto.components.agentCanvas.hooksRunHint', 'Runs when a floor is opened.'),
  teardown: () =>
    translate('auto.components.agentCanvas.hooksTeardownHint', 'Runs when a floor is removed.')
}

/**
 * Floor hooks: shell commands run around a floor's life, in that floor's own
 * checkout, with the floor's name and branch in the environment. One list serves
 * every floor, which is what makes it a workspace setting rather than a per-floor
 * one — the reference models it the same way.
 */
export function AgentCanvasFloorHooksDialog(): React.JSX.Element | null {
  const open = useFloorHooksSheetOpen()
  if (!open) {
    return null
  }
  return <FloorHooksBody />
}

function FloorHooksBody(): React.JSX.Element {
  const document = useAgentCanvas((state) => state.document)
  const [hooks, setHooks] = React.useState<WorkspaceHooks>(() => documentHooks(document))
  const [drafts, setDrafts] = React.useState<Record<FloorHookSection, string>>(() => ({
    setup: formatHookCommands(documentHooks(document).setupCommands),
    run: formatHookCommands(documentHooks(document).runCommands),
    teardown: formatHookCommands(documentHooks(document).teardownCommands)
  }))

  const save = (): void => {
    const next: WorkspaceHooks = {
      ...hooks,
      setupCommands: parseHookCommands(drafts.setup, newCanvasId, hooks.setupCommands),
      runCommands: parseHookCommands(drafts.run, newCanvasId, hooks.runCommands),
      teardownCommands: parseHookCommands(drafts.teardown, newCanvasId, hooks.teardownCommands)
    }
    setCanvasHooks(next)
    closeFloorHooksSheet()
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          closeFloorHooksSheet()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.agentCanvas.floorHooks', 'Floor hooks')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.agentCanvas.floorHooksDescription',
              'Shell commands run around the life of a floor, inside that floor checkout. One command per line.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">
              {translate('auto.components.agentCanvas.hooksEnabled', 'Enable floor hooks')}
            </span>
            <span className="text-xs text-muted-foreground">
              {translate(
                'auto.components.agentCanvas.hooksEnabledHint',
                'Off by default: these run shell commands on your machine.'
              )}
            </span>
          </div>
          <Switch
            checked={hooks.isEnabled}
            onCheckedChange={(isEnabled) => setHooks((current) => ({ ...current, isEnabled }))}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">
              {translate(
                'auto.components.agentCanvas.hooksAutoSetup',
                'Run setup when a floor is created'
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {translate(
                'auto.components.agentCanvas.hooksAutoSetupHint',
                'Turn this off to keep setup manual while run and teardown stay automatic.'
              )}
            </span>
          </div>
          <Switch
            checked={hooks.autoRunSetup}
            onCheckedChange={(autoRunSetup) =>
              setHooks((current) => ({ ...current, autoRunSetup }))
            }
          />
        </div>

        {(Object.keys(SECTION_LABELS) as FloorHookSection[]).map((section) => (
          <div key={section} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">{SECTION_LABELS[section]()}</span>
            <Textarea
              rows={2}
              value={drafts[section]}
              placeholder={translate(
                'auto.components.agentCanvas.hooksPlaceholder',
                'e.g. pnpm install'
              )}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [section]: event.target.value }))
              }
            />
            <span className="text-xs text-muted-foreground">{SECTION_HINTS[section]()}</span>
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          {translate('auto.components.agentCanvas.hooksEnvironment', 'Available in every hook:')}{' '}
          {FLOOR_HOOK_ENVIRONMENT_VARIABLES.join(', ')}
        </p>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={closeFloorHooksSheet}>
            {translate('auto.components.agentCanvas.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={save}>
            {translate('auto.components.agentCanvas.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
