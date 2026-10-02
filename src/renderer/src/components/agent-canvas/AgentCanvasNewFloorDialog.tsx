import React from 'react'
import { Info, Loader2 } from 'lucide-react'
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
import { isValidBranchName, slugifyBranch } from '../../../../shared/spatial-canvas/floor-isolation'
import { addCanvasLevel } from './agent-canvas-level-actions'
import { openBranchFloor } from './agent-canvas-branch-floor'
import { runFloorHooks } from './agent-canvas-hook-runner'
import { getAgentCanvasState } from './agent-canvas-store'
import { closeNewFloorSheet, useNewFloorSheetOpen } from './agent-canvas-new-floor'

type BranchMode = 'new' | 'existing'

/**
 * New floor, with the reference's isolation option: a floor can be its own
 * checkout on its own branch, so agents working there cannot touch the ground
 * floor's files. Orca creates the checkout as a managed worktree; this sheet
 * owns the name, the branch and the verdict.
 *
 * The reference also offers a seed copy with folder exclusions, which is how its
 * clone gets the project's files. Orca's worktree creation does not copy
 * anything, so those fields would be controls that do nothing — they are
 * deliberately absent rather than faked.
 */
export function AgentCanvasNewFloorDialog(): React.JSX.Element | null {
  const open = useNewFloorSheetOpen()
  if (!open) {
    return null
  }
  return <NewFloorBody />
}

function NewFloorBody(): React.JSX.Element {
  const repoId = useAppStore((state) => state.activeRepoId)
  const hasRepository = repoId !== null
  const [name, setName] = React.useState('')
  const [isolated, setIsolated] = React.useState(hasRepository)
  const [mode, setMode] = React.useState<BranchMode>('new')
  const [branch, setBranch] = React.useState('')
  const [creating, setCreating] = React.useState(false)

  // Why derived rather than stored: the branch follows the floor name until the
  // user types their own, and once they do this stops overwriting it.
  const [branchTouched, setBranchTouched] = React.useState(false)
  const effectiveBranch = branchTouched ? branch : slugifyBranch(name)
  const branchInvalid =
    isolated && effectiveBranch.length > 0 && !isValidBranchName(effectiveBranch)
  const canCreate =
    name.trim().length > 0 && !branchInvalid && (!isolated || effectiveBranch.length > 0)

  const create = async (): Promise<void> => {
    const floorName = name.trim()
    if (!isolated || repoId === null) {
      addCanvasLevel(floorName)
      closeNewFloorSheet()
      return
    }
    setCreating(true)
    const ok = await openBranchFloor(repoId, effectiveBranch, floorName)
    setCreating(false)
    if (ok) {
      // Why from here and not from openBranchFloor: that module is imported by the hook
      // runner, so calling back into it there would make the two import each other.
      void runFloorHooks('setup', getAgentCanvasState().activeLevelId)
      closeNewFloorSheet()
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          closeNewFloorSheet()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.agentCanvas.newFloorTitle', 'New floor')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.agentCanvas.newFloorDescriptionFull',
              'Name the new floor and it opens right after.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            {translate('auto.components.agentCanvas.floorNameLabel', 'Floor name')}
          </span>
          <Input
            autoFocus
            value={name}
            placeholder={translate(
              'auto.components.agentCanvas.floorNameExample',
              'e.g. Refactor auth'
            )}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {translate('auto.components.agentCanvas.isolation', 'Repository isolation')}
              <Info className="size-3.5 text-muted-foreground" />
            </span>
            <span className="text-xs text-muted-foreground">
              {translate(
                'auto.components.agentCanvas.isolationHint',
                'Each floor gets its own checkout of the project on its own branch, so you and your agents can work on different things at the same time without touching each other’s files.'
              )}
            </span>
          </div>
          <Switch
            checked={isolated && hasRepository}
            disabled={!hasRepository}
            onCheckedChange={setIsolated}
          />
        </div>

        {!hasRepository ? (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.agentCanvas.isolationNoRepo',
              'This workspace is not in a Git repository, so a floor cannot have its own checkout.'
            )}
          </p>
        ) : null}

        {isolated && hasRepository ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">
              {translate(
                'auto.components.agentCanvas.branchLegend',
                'Create a new branch, or use one that already exists'
              )}
            </span>
            <div className="flex gap-1.5">
              {(['new', 'existing'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs',
                    mode === value
                      ? 'border-canvas-accent bg-canvas-accent-soft text-foreground'
                      : 'border-border text-muted-foreground hover:bg-foreground/5'
                  )}
                >
                  {value === 'new'
                    ? translate('auto.components.agentCanvas.branchModeNew', 'New branch')
                    : translate(
                        'auto.components.agentCanvas.branchModeExisting',
                        'Existing branch'
                      )}
                </button>
              ))}
            </div>
            <Input
              value={effectiveBranch}
              placeholder={
                mode === 'new'
                  ? translate(
                      'auto.components.agentCanvas.branchPlaceholderNew',
                      'Name for the new branch'
                    )
                  : translate(
                      'auto.components.agentCanvas.branchPlaceholderExisting',
                      'Name of the existing branch'
                    )
              }
              aria-invalid={branchInvalid}
              onChange={(event) => {
                setBranchTouched(true)
                setBranch(event.target.value)
              }}
            />
            {branchInvalid ? (
              <p className="text-xs text-destructive">
                {translate(
                  'auto.components.agentCanvas.branchInvalid',
                  'That is not a valid Git branch name. Avoid spaces and the characters ~ ^ : ? *'
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={closeNewFloorSheet}>
            {translate('auto.components.agentCanvas.cancel', 'Cancel')}
          </Button>
          <Button type="button" disabled={!canCreate || creating} onClick={() => void create()}>
            {creating ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.agentCanvas.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
