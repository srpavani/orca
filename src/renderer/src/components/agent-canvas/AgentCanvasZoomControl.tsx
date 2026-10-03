import React from 'react'
import { Minus, Plus } from 'lucide-react'
import { translate } from '@/i18n/i18n'

/**
 * Zoom out, the zoom readout (click to fit the board), zoom in. Kept beside the
 * floor pill like the reference, so the two groups never overlap in the corner.
 */
export function AgentCanvasZoomControl(props: {
  zoom: number
  onZoomBy: (direction: 1 | -1) => void
  onFit: () => void
}): React.JSX.Element {
  return (
    <div className="canvas-glass pointer-events-auto flex h-[34px] items-center gap-0.5 rounded-full px-1.5">
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        aria-label={translate('auto.components.agentCanvas.zoomOut', 'Zoom out')}
        onClick={() => props.onZoomBy(-1)}
      >
        <Minus className="size-3.5" />
      </button>
      <button
        type="button"
        title={translate('auto.components.agentCanvas.fitView', 'Fit the board to the window')}
        className="pointer-events-auto w-10 shrink-0 rounded-full py-0.5 text-center text-[10px] tabular-nums text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        onClick={props.onFit}
      >
        {Math.round(props.zoom * 100)}%
      </button>
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        aria-label={translate('auto.components.agentCanvas.zoomIn', 'Zoom in')}
        onClick={() => props.onZoomBy(1)}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}
