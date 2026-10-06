import React from 'react'
import { Paperclip } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { AgentCanvasGlassButton, AgentCanvasGlassToolbar } from './AgentCanvasGlass'
import { CanvasModeIcon } from './AgentCanvasIcons'
import { setCanvasMode, useCanvasMode, type CanvasMode } from './agent-canvas-mode'
import { setCanvasViewState, useAgentCanvas } from './agent-canvas-store'

const ITEMS: readonly { id: CanvasMode; label: () => string }[] = [
  { id: 'select', label: () => translate('auto.components.agentCanvas.toolSelect', 'Selection') },
  {
    id: 'terminal',
    label: () => translate('auto.components.agentCanvas.toolTerminal', 'Add terminal')
  },
  { id: 'note', label: () => translate('auto.components.agentCanvas.toolNote', 'Add note') },
  {
    id: 'fileTree',
    label: () => translate('auto.components.agentCanvas.toolFileTree', 'File Tree')
  },
  { id: 'portal', label: () => translate('auto.components.agentCanvas.toolPortal', 'Portal') },
  { id: 'text', label: () => translate('auto.components.agentCanvas.toolText', 'Text') },
  { id: 'draw', label: () => translate('auto.components.agentCanvas.toolDraw', 'Draw') }
]

/**
 * The reference's MainToolbar: Selection, Add terminal, Add note, Attach, File
 * Tree, Portal, Text and Draw, in that order, each a GlassButton. Picking the
 * armed tool again drops back to Selection, and Draw re-arms the last pen, as
 * the reference's handlePickMode does.
 */
export function AgentCanvasMainToolbar(props: {
  onAttach: (file: File) => void
}): React.JSX.Element {
  const mode = useCanvasMode()
  const drawTool = useAgentCanvas((state) => state.drawTool)
  const lastPen = React.useRef<NonNullable<typeof drawTool>>('freehand')
  const fileRef = React.useRef<HTMLInputElement | null>(null)
  if (drawTool !== null) {
    lastPen.current = drawTool
  }
  const effective: CanvasMode = drawTool !== null ? 'draw' : mode

  const pick = (next: CanvasMode): void => {
    if (next === effective) {
      setCanvasMode('select')
      setCanvasViewState({ drawTool: null })
      return
    }
    setCanvasMode(next)
    setCanvasViewState({ drawTool: next === 'draw' ? lastPen.current : null })
  }

  return (
    <AgentCanvasGlassToolbar
      role="toolbar"
      aria-label={translate('auto.components.agentCanvas.mainToolbar', 'Canvas tools')}
    >
      {ITEMS.map((item) => (
        <React.Fragment key={item.id}>
          <AgentCanvasGlassButton
            active={effective === item.id}
            label={item.label()}
            onClick={() => pick(item.id)}
          >
            <CanvasModeIcon mode={item.id} />
          </AgentCanvasGlassButton>
          {item.id === 'note' ? (
            <>
              <AgentCanvasGlassButton
                label={translate('auto.components.agentCanvas.toolAttach', 'Attach')}
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="size-5" />
              </AgentCanvasGlassButton>
              <input
                ref={fileRef}
                type="file"
                tabIndex={-1}
                aria-hidden="true"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) {
                    props.onAttach(file)
                  }
                }}
              />
            </>
          ) : null}
        </React.Fragment>
      ))}
    </AgentCanvasGlassToolbar>
  )
}
