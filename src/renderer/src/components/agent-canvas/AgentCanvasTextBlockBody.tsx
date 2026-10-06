import React from 'react'
import { translate } from '@/i18n/i18n'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import type { CardHeaderDrag } from './AgentCanvasCardHeaders'
import { writeCanvasNote } from './agent-canvas-store'

/** The reference's text block metrics (TextBlockBody). */
const TEXT_FONT_SIZE = 24
const PADDING = 6
const CLICK_MOVE_TOLERANCE = 4
const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif'

/**
 * The reference's text block: bare text on the board, no card. The whole block
 * is its drag handle; a click on an already-selected block starts editing, and
 * Enter (without Shift) or Escape commits — as there.
 */
export function AgentCanvasTextBlockBody(props: {
  node: CanvasNode
  text: string
  selected: boolean
  drag: CardHeaderDrag
}): React.JSX.Element | null {
  const { node, text } = props
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(text)
  const start = React.useRef<{ x: number; y: number; wasSelected: boolean } | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    if (!editing) {
      setDraft(text)
    }
  }, [text, editing])
  React.useEffect(() => {
    const element = textareaRef.current
    if (editing && element) {
      element.focus()
      element.setSelectionRange(element.value.length, element.value.length)
    }
  }, [editing])
  if (node.content.kind !== 'text') {
    return null
  }
  const textId = node.content.textId
  const commit = (): void => {
    writeCanvasNote(textId, draft)
    setEditing(false)
  }
  const style: React.CSSProperties = {
    fontFamily: FONT_STACK,
    fontSize: TEXT_FONT_SIZE,
    lineHeight: 1.25,
    padding: PADDING,
    whiteSpace: 'pre'
  }
  const empty = draft.length === 0
  return (
    <div
      role="group"
      aria-label={translate('auto.components.agentCanvas.textBlock', 'Text block')}
      className="relative size-full"
      onPointerDownCapture={(event) => {
        start.current = { x: event.clientX, y: event.clientY, wasSelected: props.selected }
      }}
      onPointerUp={(event) => {
        const from = start.current
        start.current = null
        if (!from || !from.wasSelected || editing) {
          return
        }
        if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_MOVE_TOLERANCE) {
          return
        }
        setEditing(true)
      }}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          spellCheck={false}
          wrap="off"
          aria-label={translate('auto.components.agentCanvas.editTextBlock', 'Edit text block')}
          className="absolute inset-0 resize-none overflow-hidden border-0 bg-transparent text-foreground outline-none"
          style={style}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
              event.preventDefault()
              commit()
            }
          }}
        />
      ) : (
        <div
          {...props.drag}
          className="size-full cursor-grab select-none overflow-hidden active:cursor-grabbing"
          style={{ ...style, opacity: empty ? 0.3 : 1 }}
        >
          {empty ? translate('auto.components.agentCanvas.textPlaceholderShort', 'Text') : draft}
        </div>
      )}
    </div>
  )
}
