import React from 'react'
import { Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CanvasNoteColor, CanvasNodeId } from '../../../../shared/spatial-canvas/types'
import {
  NOTE_COLOR_KEYS,
  NOTE_COLOR_NAMES,
  NOTE_COLOR_ORDER,
  NOTE_PAPER_CLASS
} from './agent-canvas-note-paper'
import { setCanvasNoteColor } from './agent-canvas-document-setters'

/**
 * Paper-colour picker for a sticky note. Ten fixed papers rather than a colour
 * wheel: a note's colour is a label the user reads at a glance, so it has to be
 * the same ten colours in every canvas and both themes.
 */
export function AgentCanvasNoteColorPicker(props: {
  nodeId: CanvasNodeId
  color: CanvasNoteColor
}): React.JSX.Element {
  const label = translate('auto.components.agentCanvas.noteColor', 'Note colour')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative shrink-0 rounded p-0.5 opacity-50 hover:bg-foreground/10 hover:opacity-100"
          aria-label={label}
          title={label}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Palette className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto">
        <div className="grid grid-cols-5 gap-1.5 p-2">
          {NOTE_COLOR_ORDER.map((color) => (
            <button
              key={color}
              type="button"
              className={cn(
                'size-5 rounded-full border',
                NOTE_PAPER_CLASS[color],
                color === props.color ? 'border-foreground' : 'border-border'
              )}
              aria-label={translate(NOTE_COLOR_KEYS[color], NOTE_COLOR_NAMES[color])}
              title={translate(NOTE_COLOR_KEYS[color], NOTE_COLOR_NAMES[color])}
              onClick={() => setCanvasNoteColor(props.nodeId, color)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
