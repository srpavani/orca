import React from 'react'
import { ArrowUpRight, Circle, Palette, Pencil, Square } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { openAppearanceSheet } from './agent-canvas-appearance-sheet'
import { setCanvasViewState, useAgentCanvas } from './agent-canvas-store'
import {
  AgentCanvasGlassButton,
  AgentCanvasGlassToolbar,
  AgentCanvasToolbarDivider
} from './AgentCanvasGlass'

/** The reference's TOOL_ICONS for the draw tools Orca carries: pen, arrow, rectangle, ellipse. */
const TOOLS = [
  {
    tool: 'freehand',
    Icon: Pencil,
    label: () => translate('auto.components.agentCanvas.drawFreehand', 'Pen')
  },
  {
    tool: 'arrow',
    Icon: ArrowUpRight,
    label: () => translate('auto.components.agentCanvas.drawArrow', 'Arrow')
  },
  {
    tool: 'rect',
    Icon: Square,
    label: () => translate('auto.components.agentCanvas.drawRect', 'Rectangle')
  },
  {
    tool: 'ellipse',
    Icon: Circle,
    label: () => translate('auto.components.agentCanvas.drawEllipse', 'Ellipse')
  }
] as const

/**
 * The reference's DrawToolbar, shown under the main toolbar while Draw is
 * armed: one GlassButton per tool (size-4 icons), a divider, then the board's
 * appearance.
 */
export function AgentCanvasLevelBar(): React.JSX.Element {
  const drawTool = useAgentCanvas((state) => state.drawTool)
  return (
    <AgentCanvasGlassToolbar
      role="toolbar"
      aria-label={translate('auto.components.agentCanvas.drawToolbar', 'Drawing tools')}
      className="max-w-full overflow-x-auto [scrollbar-width:none]"
    >
      {TOOLS.map(({ tool, Icon, label }) => (
        <AgentCanvasGlassButton
          key={tool}
          active={drawTool === tool}
          label={label()}
          onClick={() => setCanvasViewState({ drawTool: tool })}
        >
          <Icon className="size-4" />
        </AgentCanvasGlassButton>
      ))}
      <AgentCanvasToolbarDivider />
      <AgentCanvasGlassButton
        label={translate('auto.components.agentCanvas.appearance', 'Appearance')}
        onClick={openAppearanceSheet}
      >
        <Palette className="size-4" />
      </AgentCanvasGlassButton>
    </AgentCanvasGlassToolbar>
  )
}
