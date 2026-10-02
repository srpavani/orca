import React from 'react'
import { ArrowLeft, Network, StickyNote, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'

export function AgentCanvasHeader(props: {
  zoom: number
  onBack: () => void
  onAddNote: () => void
  onZoom: (direction: 1 | -1) => void
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
      <Button variant="outline" size="sm" onClick={props.onBack} className="shrink-0">
        <ArrowLeft className="size-3.5" />
        {translate('auto.components.agentCanvas.back', 'Back')}
      </Button>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30">
        <Network className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold text-foreground">
            {translate('auto.components.agentCanvas.title', 'Agent Canvas')}
          </h1>
          <Badge variant="secondary">{translate('auto.components.agentCanvas.beta', 'Beta')}</Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {translate(
            'auto.components.agentCanvas.subtitle',
            'Wire sessions together to let their agents ask each other. Cutting a wire revokes access.'
          )}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={props.onAddNote}>
        <StickyNote className="size-3.5" />
        {translate('auto.components.agentCanvas.addNote', 'Note')}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => props.onZoom(-1)}
        aria-label={translate('auto.components.agentCanvas.zoomOut', 'Zoom out')}
      >
        <ZoomOut className="size-4" />
      </Button>
      <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
        {Math.round(props.zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => props.onZoom(1)}
        aria-label={translate('auto.components.agentCanvas.zoomIn', 'Zoom in')}
      >
        <ZoomIn className="size-4" />
      </Button>
    </div>
  )
}
