import React from 'react'
import { ArrowUpRight, Circle, Globe, Pencil, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { setCanvasViewState, useAgentCanvas } from './agent-canvas-store'

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

const chip =
  'flex h-7 shrink-0 items-center gap-1 rounded-full border-0 px-2 text-xs transition-colors'
const IDLE = 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'

/**
 * The canvas toolbar: what you can draw, and the portal. Floors are deliberately
 * not here — they live in the corner pill that opens the stack, which is where
 * the reference puts them, so the toolbar stays about the floor you are on.
 */
export function AgentCanvasLevelBar(props: { onAddPortal: () => void }): React.JSX.Element {
  const drawTool = useAgentCanvas((state) => state.drawTool)
  return (
    <div className="canvas-glass pointer-events-auto flex max-w-[calc(100%-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-2xl p-1.5">
      {TOOLS.map(({ tool, Icon, label }) => (
        <button
          key={tool}
          type="button"
          aria-pressed={drawTool === tool}
          aria-label={label()}
          title={label()}
          className={cn(chip, drawTool === tool ? 'bg-foreground/10 text-foreground' : IDLE)}
          onClick={() => setCanvasViewState({ drawTool: drawTool === tool ? null : tool })}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
      <div className="mx-1 h-5 w-px shrink-0 bg-foreground/15" />
      <button
        type="button"
        className={cn(chip, IDLE)}
        title={translate('auto.components.agentCanvas.addPortal', 'Portal')}
        onClick={props.onAddPortal}
      >
        <Globe className="size-3.5" />
        {translate('auto.components.agentCanvas.addPortal', 'Portal')}
      </button>
    </div>
  )
}
