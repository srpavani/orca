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
import { AgentCanvasGlassButton } from './AgentCanvasGlass'

/**
 * The note toolbar's colour button: the reference's ColorPickerPopover for a
 * sticky note — a Palette glass button opening a five-column grid of round
 * paper swatches, the current one marked with a dot in its ink colour.
 */
export function AgentCanvasNoteColorPicker(props: {
  nodeId: CanvasNodeId
  color: CanvasNoteColor
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const label = translate('auto.components.agentCanvas.changeNoteColor', 'Change note color')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AgentCanvasGlassButton label={label} active={open}>
          <Palette className="size-5" />
        </AgentCanvasGlassButton>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={10} className="w-auto">
        <div role="group" aria-label={label} className="grid grid-cols-5 gap-1.5">
          {NOTE_COLOR_ORDER.map((color) => {
            const active = color === props.color
            const name = translate(NOTE_COLOR_KEYS[color], NOTE_COLOR_NAMES[color])
            return (
              <button
                key={color}
                type="button"
                aria-label={name}
                title={name}
                aria-pressed={active}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border border-black/10 transition-transform hover:scale-110',
                  NOTE_PAPER_CLASS[color]
                )}
                onClick={() => {
                  setCanvasNoteColor(props.nodeId, color)
                  setOpen(false)
                }}
              >
                {active ? <span aria-hidden className="size-2 rounded-full bg-current" /> : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
