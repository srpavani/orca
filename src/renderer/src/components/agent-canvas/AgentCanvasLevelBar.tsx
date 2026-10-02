import React from 'react'
import {
  ArrowUpRight,
  Circle,
  GitBranch,
  Globe,
  Layers,
  Pencil,
  Plus,
  Square,
  Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { levelsOf } from '../../../../shared/spatial-canvas/levels'
import type { CanvasDocument } from '../../../../shared/spatial-canvas/types'
import {
  addCanvasLevel,
  deleteCanvasLevel,
  renameCanvasLevel,
  sendCanvasNodeToLevel,
  switchCanvasLevel
} from './agent-canvas-level-actions'
import { setCanvasViewState, useAgentCanvas } from './agent-canvas-store'
import { AgentCanvasBranchFloorMenu } from './AgentCanvasBranchFloorMenu'

const TOOLS = [
  {
    tool: 'freehand',
    Icon: Pencil,
    label: () => translate('auto.components.agentCanvas.drawFreehand', 'Pen')
  },
  {
    tool: 'rect',
    Icon: Square,
    label: () => translate('auto.components.agentCanvas.drawRect', 'Box')
  },
  {
    tool: 'ellipse',
    Icon: Circle,
    label: () => translate('auto.components.agentCanvas.drawEllipse', 'Ellipse')
  },
  {
    tool: 'arrow',
    Icon: ArrowUpRight,
    label: () => translate('auto.components.agentCanvas.drawArrow', 'Arrow')
  }
] as const

const chip = 'flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors'

/**
 * Floors and drawing tools. Each floor is its own plane of cards and wires
 * (wires never cross floors), mirroring one floor per branch/worktree.
 */
export function AgentCanvasLevelBar(props: {
  document: CanvasDocument
  onAddPortal: () => void
}): React.JSX.Element {
  const activeLevelId = useAgentCanvas((state) => state.activeLevelId)
  const drawTool = useAgentCanvas((state) => state.drawTool)
  const selectedNodeId = useAgentCanvas((state) => state.selectedNodeId)
  const levels = levelsOf(props.document)
  const branchOf = (levelId: string | null): string | null =>
    props.document.levels.find((level) => level.id === levelId)?.branch ?? null

  const promptName = (fallback: string): string | null => {
    const name = window.prompt(
      translate('auto.components.agentCanvas.floorNamePrompt', 'Floor name (e.g. a branch)'),
      fallback
    )
    return name && name.trim() ? name.trim() : null
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-5 py-1.5">
      <Layers className="size-3.5 shrink-0 text-muted-foreground" />
      {levels.map((level) => {
        const active = level.id === activeLevelId
        return (
          <button
            key={level.id ?? 'ground'}
            type="button"
            className={cn(
              chip,
              active
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
            title={
              selectedNodeId && !active
                ? translate(
                    'auto.components.agentCanvas.floorSendHint',
                    'Shift-click to move the selected card here'
                  )
                : undefined
            }
            onClick={(event) => {
              if (event.shiftKey && selectedNodeId && !active) {
                sendCanvasNodeToLevel(selectedNodeId, level.id)
                return
              }
              switchCanvasLevel(level.id)
            }}
            onDoubleClick={() => {
              if (level.id === null) {
                return
              }
              const name = promptName(level.name)
              if (name) {
                renameCanvasLevel(level.id, name)
              }
            }}
          >
            {branchOf(level.id) ? <GitBranch className="size-3 opacity-70" /> : null}
            {level.id === null
              ? translate('auto.components.agentCanvas.groundFloor', 'Ground')
              : level.name}
            <span className="tabular-nums opacity-60">
              {level.contents.nodes.filter((node) => node.content.kind === 'session').length}
            </span>
          </button>
        )
      })}
      <button
        type="button"
        className={cn(
          chip,
          'border-dashed border-border text-muted-foreground hover:text-foreground'
        )}
        onClick={() => {
          const name = promptName(`Floor ${levels.length}`)
          if (name) {
            addCanvasLevel(name)
          }
        }}
      >
        <Plus className="size-3" />
        {translate('auto.components.agentCanvas.addFloor', 'Floor')}
      </button>
      <AgentCanvasBranchFloorMenu chipClassName={chip} />
      {activeLevelId !== null ? (
        <button
          type="button"
          className={cn(chip, 'border-border text-muted-foreground hover:text-destructive')}
          aria-label={translate('auto.components.agentCanvas.deleteFloor', 'Delete floor')}
          onClick={() => {
            const ok = window.confirm(
              translate(
                'auto.components.agentCanvas.deleteFloorConfirm',
                'Delete this floor? Sessions on it move to the ground floor; notes, drawings and portals are removed.'
              )
            )
            if (ok) {
              deleteCanvasLevel(activeLevelId)
            }
          }}
        >
          <Trash2 className="size-3" />
        </button>
      ) : null}
      <div className="mx-1 h-5 w-px shrink-0 bg-border" />
      {TOOLS.map(({ tool, Icon, label }) => (
        <button
          key={tool}
          type="button"
          aria-pressed={drawTool === tool}
          aria-label={label()}
          title={label()}
          className={cn(
            chip,
            drawTool === tool
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setCanvasViewState({ drawTool: drawTool === tool ? null : tool })}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
      <button
        type="button"
        className={cn(chip, 'border-border text-muted-foreground hover:text-foreground')}
        onClick={props.onAddPortal}
      >
        <Globe className="size-3.5" />
        {translate('auto.components.agentCanvas.addPortal', 'Portal')}
      </button>
    </div>
  )
}
