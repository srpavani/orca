import React from 'react'
import { ArrowLeft, Network, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'

export function AgentCanvasHeader(props: {
  onBack: () => void
  onAddNote: () => void
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={props.onBack}
        aria-label={translate('auto.components.agentCanvas.back', 'Back')}
      >
        <ArrowLeft className="size-4" />
      </Button>
      <Network className="size-3.5 shrink-0 text-muted-foreground" />
      <h1 className="min-w-0 shrink truncate text-sm font-medium text-foreground">
        {translate('auto.components.agentCanvas.title', 'Agent Canvas')}
      </h1>
      <Badge variant="secondary">{translate('auto.components.agentCanvas.beta', 'Beta')}</Badge>
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {translate(
          'auto.components.agentCanvas.subtitle',
          'Wire sessions together to let their agents ask each other. Cutting a wire revokes access.'
        )}
      </p>
      <Button variant="outline" size="sm" onClick={props.onAddNote}>
        <StickyNote className="size-3.5" />
        {translate('auto.components.agentCanvas.addNote', 'Note')}
      </Button>
    </div>
  )
}
