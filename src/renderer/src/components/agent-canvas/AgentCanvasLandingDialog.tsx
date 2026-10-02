import React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  closeLandingSheet,
  fetchLandingPreflight,
  fetchLandingPreview,
  floorWorktreePath,
  landFloorOn,
  refusalText,
  useLandingSheet,
  type LandingPreflight,
  type LandingPreview
} from './agent-canvas-landing'
import { deleteCanvasLevel } from './agent-canvas-level-actions'
import { AgentCanvasResolveConflicts } from './AgentCanvasResolveConflicts'

const T = 'auto.components.agentCanvas.landing'

/**
 * Land: merge the floor's branch into a branch on Ground, then keep or discard
 * the floor — the reference's dialog, step for step. Targets come from the host;
 * a branch checked out in another worktree is listed but not offered.
 */
export function AgentCanvasLandingDialog(): React.JSX.Element | null {
  const sheet = useLandingSheet()
  if (!sheet) {
    return null
  }
  return <LandingBody key={sheet.levelId} {...sheet} />
}

function LandingBody(props: { levelId: string; name: string; branch: string }): React.JSX.Element {
  const worktreePath = React.useMemo(() => floorWorktreePath(props.branch), [props.branch])
  const [preflight, setPreflight] = React.useState<LandingPreflight | null>(null)
  const [target, setTarget] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<LandingPreview | null>(null)
  const [keepFloor, setKeepFloor] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (worktreePath === null) {
      setPreflight({ ok: false, refusal: { reason: 'notIsolated' } })
      return
    }
    let live = true
    void fetchLandingPreflight(worktreePath).then((result) => {
      if (!live) {
        return
      }
      setPreflight(result)
      if (result.ok) {
        const ground = result.targets.find((entry) => entry.isGroundBranch)
        const first = ground ?? result.targets.find((entry) => entry.unavailable === null)
        setTarget(first?.name ?? null)
      }
    })
    return () => {
      live = false
    }
  }, [worktreePath])

  React.useEffect(() => {
    if (worktreePath === null || target === null) {
      setPreview(null)
      return
    }
    let live = true
    setPreview(null)
    void fetchLandingPreview(worktreePath, target).then((result) => {
      if (live) {
        setPreview(result)
      }
    })
    return () => {
      live = false
    }
  }, [worktreePath, target])

  const ready = preflight?.ok === true ? preflight : null
  const nothingToLand = preview !== null && preview.commitCount === 0
  const conflicts = preview !== null && preview.conflicts.length > 0
  const canLand =
    ready !== null &&
    !ready.trackedDirty &&
    target !== null &&
    preview !== null &&
    !nothingToLand &&
    !conflicts &&
    !busy

  const land = async (): Promise<void> => {
    if (worktreePath === null || target === null) {
      return
    }
    setBusy(true)
    setError(null)
    const result = await landFloorOn(worktreePath, target)
    setBusy(false)
    if (result.status === 'merged') {
      toast.success(
        translate(`${T}.landed`, 'The work from {{name}} has been merged into “{{target}}”.', {
          name: props.name,
          target
        })
      )
      if (!keepFloor) {
        deleteCanvasLevel(props.levelId)
      }
      closeLandingSheet()
      return
    }
    if (result.status === 'refused') {
      setError(refusalText(result.refusal))
    } else if (result.status === 'conflicts') {
      const warning = translate(
        `${T}.conflictWarning`,
        'Code conflicts were found. Resolve them before continuing or choose another branch.'
      )
      setError(`${warning} (${result.files.join(', ')})`)
    } else {
      setError(translate(`${T}.failed`, 'The merge failed: {{detail}}', { detail: result.detail }))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : closeLandingSheet())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate(`${T}.title`, 'Land')} · {props.name}
          </DialogTitle>
          <DialogDescription>
            {target === null
              ? translate(
                  `${T}.description`,
                  "Merge this floor's branch into a branch on Ground, then keep or discard the floor."
                )
              : translate(
                  `${T}.subtitle`,
                  'Changes made on this floor will be merged into {{target}}.',
                  { target }
                )}
          </DialogDescription>
        </DialogHeader>
        {preflight === null ? (
          <p className="text-xs text-muted-foreground">
            {translate(`${T}.preparing`, "Reading the floor's branch...")}
          </p>
        ) : !preflight.ok ? (
          <p className="text-xs text-destructive">{refusalText(preflight.refusal)}</p>
        ) : (
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <span className="font-medium">{translate(`${T}.targetLabel`, 'Target branch')}</span>
              <div className="flex max-h-36 flex-col gap-0.5 overflow-y-auto scrollbar-sleek">
                {preflight.targets.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    disabled={entry.unavailable !== null}
                    onClick={() => setTarget(entry.name)}
                    className={cn(
                      'flex items-center justify-between rounded-md px-2 py-1 text-left',
                      entry.name === target ? 'bg-accent' : 'hover:bg-accent/50',
                      entry.unavailable !== null && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <span className="truncate font-mono">{entry.name}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                      {entry.unavailable
                        ? translate(`${T}.branchCheckedOutAt`, 'Checked out at {{path}}', {
                            path: entry.unavailable.worktreePath
                          })
                        : entry.isGroundBranch
                          ? translate('auto.components.agentCanvas.groundFloor', 'Ground')
                          : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <LandingChanges preview={preview} target={target} floorBranch={preflight.floorBranch} />
            {preflight.trackedDirty ? (
              <p className="text-destructive">
                {translate(
                  `${T}.dirtyWorktree`,
                  'This floor has uncommitted changes. They would not land, so commit them on the floor first.'
                )}
              </p>
            ) : null}
            {preflight.untrackedCount > 0 ? (
              <p className="text-muted-foreground">
                {translate(
                  `${T}.untrackedDiscard`,
                  '{{count}} untracked files on this floor will not land.',
                  { count: preflight.untrackedCount }
                )}
              </p>
            ) : null}
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={keepFloor}
                onChange={(event) => setKeepFloor(event.target.checked)}
              />
              <span>
                {translate(`${T}.keepFloor`, 'Keep this floor after landing')}
                <span className="block text-muted-foreground">
                  {keepFloor
                    ? translate(
                        `${T}.keepFloorOn`,
                        'The floor will remain available for continued work.'
                      )
                    : translate(
                        `${T}.keepFloorOff`,
                        'This floor along with all its terminals and notes will be discarded.'
                      )}
                </span>
              </span>
            </label>
            {error ? <p className="text-destructive">{error}</p> : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => closeLandingSheet()}>
            {translate('auto.components.agentCanvas.cancel', 'Cancel')}
          </Button>
          <Button disabled={!canLand} onClick={() => void land()}>
            {translate(`${T}.title`, 'Land')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LandingChanges(props: {
  preview: LandingPreview | null
  target: string | null
  floorBranch: string
}): React.JSX.Element | null {
  const { preview, target } = props
  if (target === null) {
    return (
      <p className="text-muted-foreground">
        {translate(`${T}.selectTarget`, 'Select a branch to preview changes')}
      </p>
    )
  }
  if (preview === null) {
    return (
      <p className="text-muted-foreground">
        {translate(`${T}.loadingChanges`, 'Loading changes...')}
      </p>
    )
  }
  if (preview.commitCount === 0) {
    return (
      <p className="text-muted-foreground">
        {translate(
          `${T}.nothingToLand`,
          'There is nothing to land: {{target}} already has every commit from this floor.',
          { target }
        )}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium">
        {translate(`${T}.changes`, 'Changes')} ·{' '}
        {translate(`${T}.commitCount`, '{{count}} commits', { count: preview.commitCount })}
      </span>
      <ul className="max-h-32 overflow-y-auto scrollbar-sleek font-mono text-[11px]">
        {preview.files.map((file) => (
          <li
            key={file}
            className={cn('truncate', preview.conflicts.includes(file) && 'text-destructive')}
          >
            {file}
          </li>
        ))}
      </ul>
      {preview.conflicts.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-destructive">
            {translate(
              `${T}.conflictWarning`,
              'Code conflicts were found. Resolve them before continuing or choose another branch.'
            )}
          </p>
          <AgentCanvasResolveConflicts
            conflictFiles={preview.conflicts}
            sourceBranch={props.floorBranch}
            targetBranch={target}
          />
        </div>
      ) : null}
    </div>
  )
}
