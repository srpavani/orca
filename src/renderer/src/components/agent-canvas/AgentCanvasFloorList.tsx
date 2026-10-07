import React from 'react'
import { Check, Cloud, CloudOff, GitMerge, Layers, Layers2, Plus, X, Zap } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { canUnloadFloor, levelIsUnloaded } from '../../../../shared/spatial-canvas/floor-lifecycle'
import { levelsOf } from '../../../../shared/spatial-canvas/levels'
import type { CanvasDocument, CanvasLevelId } from '../../../../shared/spatial-canvas/types'
import {
  deleteCanvasLevel,
  renameCanvasLevel,
  setCanvasLevelLoaded,
  switchCanvasLevel
} from './agent-canvas-level-actions'
import { openCanvasPrompt } from './agent-canvas-prompt'
import { openNewFloorSheet } from './agent-canvas-new-floor'
import { openFloorHooksSheet } from './agent-canvas-floor-hooks-sheet'
import { openLandingSheet } from './agent-canvas-landing'
import { toggleFloorOverview } from './agent-canvas-floor-snapshots'
import { useAgentCanvas } from './agent-canvas-store'

/** One row of the floor list, matching the reference's 38px item. */
const ITEM_HEIGHT = 38

/**
 * Floors, as the reference shows them: a small glass pill in the corner naming
 * the floor you are on, which opens the stack. While the stack is up the pill
 * becomes the list — every floor, the live one marked, each removable — because
 * a tilted sheet must not take clicks, so the list is what switches floors.
 */
export function AgentCanvasFloorList(props: {
  document: CanvasDocument
  stageHeight: number
  /** Chrome that sits beside the pill in the same corner (the zoom control). */
  trailing?: React.ReactNode
}): React.JSX.Element {
  const activeLevelId = useAgentCanvas((state) => state.activeLevelId)
  const overview = useAgentCanvas((state) => state.floorOverview)
  const levels = levelsOf(props.document)
  const hasFloors = levels.length > 1
  const active = levels.find((level) => level.id === activeLevelId) ?? levels[0]
  const activeName =
    active?.id === null
      ? translate('auto.components.agentCanvas.groundFloor', 'Ground')
      : (active?.name ?? '')
  // The reference lists floors top-down, so the stack's top floor leads.
  const displayItems = levels.toReversed()
  const maxHeight = Math.min(
    displayItems.length * ITEM_HEIGHT + 16 + 40,
    Math.max(props.stageHeight * 0.7, 200)
  )

  return (
    <div
      data-canvas-chrome=""
      className="pointer-events-none absolute bottom-3 right-3 z-30 flex flex-col items-end gap-2"
      // Why: this chrome sits inside the board surface, whose pointerdown closes the
      // floor stack. Without this a press on New floor (or any row) closed and
      // unmounted the list before its click could land, so nothing happened.
      onPointerDown={(event) => event.stopPropagation()}
    >
      {overview ? (
        <div
          className="canvas-glass pointer-events-auto flex w-56 flex-col overflow-hidden rounded-2xl p-2"
          style={{ maxHeight }}
          role="listbox"
          data-floor-sidebar=""
          aria-label={translate('auto.components.agentCanvas.floorsTitle', 'Floors')}
        >
          <button
            type="button"
            className="agent-canvas-floor-item mb-1 flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-xs font-medium text-canvas-accent hover:bg-foreground/5"
            style={floorItemDelay(displayItems.length + 1)}
            onClick={openNewFloorSheet}
          >
            <Plus className="size-3.5" />
            {translate('auto.components.agentCanvas.newFloor', 'New floor')}
          </button>
          <button
            type="button"
            className="mb-1 flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            onClick={openFloorHooksSheet}
          >
            <Zap className="size-3.5" />
            {translate('auto.components.agentCanvas.floorHooks', 'Floor hooks')}
          </button>
          <div className="scrollbar-sleek flex min-h-0 flex-col overflow-y-auto">
            {displayItems.map((level, offset) => {
              const isActive = level.id === activeLevelId
              const label =
                level.id === null
                  ? translate('auto.components.agentCanvas.groundFloor', 'Ground')
                  : level.name
              const sessions = level.contents.nodes.filter(
                (node) => node.content.kind === 'session'
              ).length
              // Why looked up here: `levelsOf` gives the floor's contents, while the
              // branch and load state live on the level descriptor.
              const descriptor =
                level.id === null
                  ? null
                  : (props.document.levels.find((entry) => entry.id === level.id) ?? null)
              const unloaded = descriptor !== null && levelIsUnloaded(descriptor)
              const canUnload = descriptor !== null && canUnloadFloor(descriptor)
              return (
                <div
                  key={level.id ?? 'ground'}
                  className={cn(
                    'agent-canvas-floor-item group flex shrink-0 items-center gap-1 rounded-xl px-2 transition-colors duration-200',
                    isActive ? 'bg-canvas-accent text-primary-foreground' : 'hover:bg-foreground/5'
                  )}
                  // Why counted from the bottom: the reference's list grows upward out of
                  // the pill, so the floor nearest the pill appears first.
                  style={{
                    height: ITEM_HEIGHT,
                    ...floorItemDelay(displayItems.length - 1 - offset)
                  }}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className="min-w-0 flex-1 truncate text-left text-xs"
                    onClick={() => switchCanvasLevel(level.id)}
                    onDoubleClick={() => {
                      if (level.id === null) {
                        return
                      }
                      const levelId = level.id
                      openCanvasPrompt({
                        kind: 'text',
                        title: translate('auto.components.agentCanvas.renameFloor', 'Rename floor'),
                        label: translate(
                          'auto.components.agentCanvas.floorNameLabel',
                          'Floor name'
                        ),
                        initialValue: level.name,
                        confirmLabel: translate('auto.components.agentCanvas.save', 'Save'),
                        onSubmit: (name) => {
                          if (name.length > 0) {
                            renameCanvasLevel(levelId, name)
                          }
                        }
                      })
                    }}
                  >
                    {label}
                    {unloaded ? (
                      <span className="ml-1.5 shrink-0 text-[10px] opacity-70">
                        {translate('auto.components.agentCanvas.floorUnloaded', 'Unloaded')}
                      </span>
                    ) : null}
                  </button>
                  <span className="shrink-0 text-[10px] tabular-nums opacity-60">{sessions}</span>
                  {descriptor?.branch ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground opacity-0 group-hover:opacity-70 hover:text-foreground hover:opacity-100"
                      aria-label={translate('auto.components.agentCanvas.landFloor', 'Land floor')}
                      title={translate('auto.components.agentCanvas.landFloor', 'Land floor')}
                      onClick={(event) => {
                        event.stopPropagation()
                        openLandingSheet({
                          levelId: descriptor.id,
                          name: descriptor.name,
                          branch: descriptor.branch ?? ''
                        })
                      }}
                    >
                      <GitMerge className="size-3" />
                    </button>
                  ) : null}
                  {canUnload ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground opacity-0 group-hover:opacity-70 hover:text-foreground hover:opacity-100"
                      aria-label={
                        unloaded
                          ? translate('auto.components.agentCanvas.wakeFloor', 'Wake floor')
                          : translate('auto.components.agentCanvas.unloadFloor', 'Unload floor')
                      }
                      title={
                        unloaded
                          ? translate('auto.components.agentCanvas.wakeFloor', 'Wake floor')
                          : translate('auto.components.agentCanvas.unloadFloor', 'Unload floor')
                      }
                      onClick={(event) => {
                        event.stopPropagation()
                        const levelId = level.id
                        if (levelId !== null) {
                          void setCanvasLevelLoaded(levelId, unloaded)
                        }
                      }}
                    >
                      {unloaded ? <Cloud className="size-3" /> : <CloudOff className="size-3" />}
                    </button>
                  ) : null}
                  {level.id !== null ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-0.5 opacity-0 group-hover:opacity-70 hover:opacity-100"
                      aria-label={translate(
                        'auto.components.agentCanvas.deleteFloor',
                        'Delete floor'
                      )}
                      onClick={(event) => {
                        event.stopPropagation()
                        const levelId = level.id
                        if (levelId === null) {
                          return
                        }
                        openCanvasPrompt({
                          kind: 'confirm',
                          title: translate(
                            'auto.components.agentCanvas.deleteFloor',
                            'Delete floor'
                          ),
                          description: translate(
                            'auto.components.agentCanvas.deleteFloorConfirm',
                            'Delete this floor? Sessions on it move to the ground floor; notes, drawings and portals are removed.'
                          ),
                          confirmLabel: translate('auto.components.agentCanvas.delete', 'Delete'),
                          destructive: true,
                          onSubmit: () => deleteCanvasLevel(levelId)
                        })
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
      {/* The reference's bottom-right row: floor indicator, minimap, zoom pill. */}
      <div className="flex items-end gap-2">
        <FloorPill
          overview={overview}
          hasFloors={hasFloors}
          activeName={activeName}
          floors={levels.map((level) => ({
            id: level.id,
            label:
              level.id === null
                ? translate('auto.components.agentCanvas.groundFloor', 'Ground')
                : level.name
          }))}
          activeLevelId={activeLevelId}
          onToggle={toggleFloorOverview}
        />
        {props.trailing}
      </div>
    </div>
  )
}

/** The reference's sidebar stagger: 30ms between rows (FLOOR_SIDEBAR_STAGGER_STEP). */
function floorItemDelay(indexFromBottom: number): React.CSSProperties {
  return { animationDelay: `${indexFromBottom * 30}ms` }
}

/**
 * The reference's FloorIndicatorButton: a glass pill naming the floor you are
 * on (Layers2), which opens the stack (Layers, in the accent). Right-click
 * lists every floor as a check item — Ground first, then a separator — plus
 * New Floor and Configure Hooks….
 */
function FloorPill(props: {
  overview: boolean
  hasFloors: boolean
  activeName: string
  floors: readonly { id: CanvasLevelId; label: string }[]
  activeLevelId: CanvasLevelId
  onToggle: () => void
}): React.JSX.Element {
  const Icon = props.overview ? Layers : Layers2
  const title = translate('auto.components.agentCanvas.floorsTitle', 'Floors')
  return (
    <div className="canvas-glass pointer-events-auto flex items-center rounded-full">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={props.onToggle}
            aria-expanded={props.overview}
            title={title}
            className="flex h-[34px] items-center justify-center gap-1 rounded-full px-2 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ minWidth: props.hasFloors ? undefined : 40 }}
          >
            <Icon
              className="size-[13px] shrink-0"
              strokeWidth={2.25}
              style={{ color: props.overview ? 'var(--color-canvas-accent)' : undefined }}
            />
            <span className="sr-only">{title}: </span>
            <span className={props.hasFloors ? 'max-w-[120px] truncate' : 'sr-only'}>
              {props.overview ? title : props.activeName}
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {props.floors.map((floor, index) => (
            <React.Fragment key={floor.id ?? 'ground'}>
              {index === 1 ? <ContextMenuSeparator /> : null}
              <ContextMenuItem
                role="menuitemcheckbox"
                aria-checked={floor.id === props.activeLevelId}
                onSelect={() => switchCanvasLevel(floor.id)}
              >
                {floor.id === props.activeLevelId ? (
                  <Check />
                ) : (
                  <span aria-hidden className="size-3.5" />
                )}
                {floor.label}
              </ContextMenuItem>
            </React.Fragment>
          ))}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={openNewFloorSheet}>
            <Plus />
            {translate('auto.components.agentCanvas.newFloorMenu', 'New Floor')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={openFloorHooksSheet}>
            <Zap />
            {translate('auto.components.agentCanvas.configureHooks', 'Configure Hooks…')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}
/** Kept for the level bar's own floor jump; see AgentCanvasLevelBar. */
export type FloorLevelId = CanvasLevelId
