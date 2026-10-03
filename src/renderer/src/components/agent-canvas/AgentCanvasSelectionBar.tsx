import React from 'react'
import { AlignHorizontalSpaceAround, Copy, Group, Trash2, X } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { arrangeCanvasNodes } from './agent-canvas-node-actions'
import { groupNodes } from './agent-canvas-group-actions'
import { copyCanvasSelectionNow, deleteCanvasSelection } from './agent-canvas-selection-actions'
import { selectCanvasNode, useAgentCanvas } from './agent-canvas-store'

/**
 * Shown while two or more cards are selected: how many, and what can be done to
 * all of them at once — so a rectangle selection is visible and useful, not
 * just a set of faintly outlined cards. Delete and Ctrl+A/Ctrl+C work too.
 */
export function AgentCanvasSelectionBar(): React.JSX.Element | null {
  const selected = useAgentCanvas((state) => state.selectedNodeIds)
  if (selected.length < 2) {
    return null
  }
  const action = (
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    run: () => void,
    destructive = false
  ): React.JSX.Element => (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={
        destructive
          ? 'flex size-7 items-center justify-center rounded-full text-destructive hover:bg-destructive/10'
          : 'flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
      }
      onPointerDown={(event) => event.stopPropagation()}
      onClick={run}
    >
      <Icon className="size-3.5" />
    </button>
  )
  return (
    <div
      role="toolbar"
      aria-label={translate('auto.components.agentCanvas.selectionBar', 'Selection')}
      data-canvas-selection-bar=""
      className="canvas-glass pointer-events-auto absolute bottom-4 left-1/2 z-30 flex h-[38px] -translate-x-1/2 items-center gap-0.5 rounded-full pl-3.5 pr-1.5"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="pr-2 text-xs font-medium tabular-nums">
        {translate('auto.components.agentCanvas.selectedCount', '{{count}} selected', {
          count: selected.length
        })}
      </span>
      {action(
        translate('auto.components.agentCanvas.copyNode', 'Copy'),
        Copy,
        copyCanvasSelectionNow
      )}
      {action(translate('auto.components.agentCanvas.group', 'Group'), Group, () => {
        groupNodes(selected)
      })}
      {action(
        translate('auto.components.agentCanvas.tidy', 'Tidy'),
        AlignHorizontalSpaceAround,
        () => arrangeCanvasNodes(selected)
      )}
      {action(
        translate('auto.components.agentCanvas.deleteSelected', 'Delete selected'),
        Trash2,
        deleteCanvasSelection,
        true
      )}
      <span className="mx-0.5 h-4 w-px bg-foreground/15" />
      {action(translate('auto.components.agentCanvas.clearSelection', 'Clear selection'), X, () =>
        selectCanvasNode(null)
      )}
    </div>
  )
}
