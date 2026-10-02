import React from 'react'
import { Layers, Layers2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { levelsOf } from '../../../../shared/spatial-canvas/levels'
import type { CanvasDocument, CanvasLevelId } from '../../../../shared/spatial-canvas/types'
import {
  addCanvasLevel,
  deleteCanvasLevel,
  renameCanvasLevel,
  switchCanvasLevel
} from './agent-canvas-level-actions'
import { openCanvasPrompt } from './agent-canvas-prompt'
import { setCanvasViewState, useAgentCanvas } from './agent-canvas-store'

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
    <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2">
      {overview ? (
        <div
          className="canvas-glass pointer-events-auto flex w-56 flex-col overflow-hidden rounded-2xl p-2"
          style={{ maxHeight }}
          role="listbox"
          aria-label={translate('auto.components.agentCanvas.floorsTitle', 'Floors')}
        >
          <button
            type="button"
            className="mb-1 flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-xs font-medium text-canvas-accent hover:bg-foreground/5"
            onClick={() => {
              openCanvasPrompt({
                kind: 'text',
                title: translate('auto.components.agentCanvas.newFloor', 'New floor'),
                description: translate(
                  'auto.components.agentCanvas.newFloorDescription',
                  'Give the new floor a name and it opens right after.'
                ),
                label: translate('auto.components.agentCanvas.floorNameLabel', 'Floor name'),
                placeholder: translate(
                  'auto.components.agentCanvas.newFloorPlaceholder',
                  'Floor {number}'
                ).replace('{number}', String(levels.length)),
                confirmLabel: translate('auto.components.agentCanvas.create', 'Create'),
                onSubmit: (name) => {
                  if (name.length > 0) {
                    addCanvasLevel(name)
                  }
                }
              })
            }}
          >
            <Plus className="size-3.5" />
            {translate('auto.components.agentCanvas.newFloor', 'New floor')}
          </button>
          <div className="scrollbar-sleek flex min-h-0 flex-col overflow-y-auto">
            {displayItems.map((level) => {
              const isActive = level.id === activeLevelId
              const label =
                level.id === null
                  ? translate('auto.components.agentCanvas.groundFloor', 'Ground')
                  : level.name
              const sessions = level.contents.nodes.filter(
                (node) => node.content.kind === 'session'
              ).length
              return (
                <div
                  key={level.id ?? 'ground'}
                  className={cn(
                    'group flex shrink-0 items-center gap-1 rounded-xl px-2',
                    isActive ? 'bg-canvas-accent text-primary-foreground' : 'hover:bg-foreground/5'
                  )}
                  style={{ height: ITEM_HEIGHT }}
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
                  </button>
                  <span className="shrink-0 text-[10px] tabular-nums opacity-60">{sessions}</span>
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
                        const levelId = level.id as string
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
      {/* Why one row: the reference keeps the zoom with the floor control, and
          two absolutely-positioned groups in the same corner would overlap. */}
      <div className="flex items-center gap-2">
        <FloorPill
          overview={overview}
          hasFloors={hasFloors}
          activeName={activeName}
          onToggle={() => setCanvasViewState({ floorOverview: !overview })}
        />
        {props.trailing}
      </div>
    </div>
  )
}

/** The glass pill that names the current floor and opens the stack. */
function FloorPill(props: {
  overview: boolean
  hasFloors: boolean
  activeName: string
  onToggle: () => void
}): React.JSX.Element {
  const Icon = props.overview ? Layers : Layers2
  const title = translate('auto.components.agentCanvas.floorsTitle', 'Floors')
  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-expanded={props.overview}
      title={title}
      className={cn(
        'canvas-glass pointer-events-auto flex h-[34px] items-center justify-center gap-1 rounded-full px-2.5',
        'text-[10px] font-medium outline-none'
      )}
      style={{ minWidth: props.hasFloors ? undefined : 40 }}
    >
      <Icon
        className="size-[13px] shrink-0"
        strokeWidth={2.25}
        style={{ color: props.overview ? 'var(--color-canvas-accent)' : undefined }}
      />
      <span className="sr-only">{title}: </span>
      <span className={props.hasFloors ? 'max-w-32 truncate' : 'sr-only'}>
        {props.overview ? title : props.activeName}
      </span>
    </button>
  )
}

/** Kept for the level bar's own floor jump; see AgentCanvasLevelBar. */
export type FloorLevelId = CanvasLevelId
