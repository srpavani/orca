import React from 'react'
import { EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type {
  CanvasNode,
  CanvasNoteColor,
  CanvasRect
} from '../../../../shared/spatial-canvas/types'
import type { CanvasSelectionPaint } from '../../../../shared/spatial-canvas/canvas-appearance'
import type { CardAgentState } from './agent-canvas-card-status'
import { canvasNodeRedacted } from '../../../../shared/spatial-canvas/node-display'
import { writeCanvasNote } from './agent-canvas-store'
import { NOTE_PAPER_CLASS, parseNoteColor } from './agent-canvas-note-paper'
import {
  CARD_HEADER_HEIGHT,
  FileTreeCardHeader,
  NoteCardHeader,
  PortalCardHeader,
  SessionCardHeader,
  type CardHeaderDrag
} from './AgentCanvasCardHeaders'
import { AgentCanvasTextBlockBody } from './AgentCanvasTextBlockBody'

type AgentCanvasNodeCardProps = {
  node: CanvasNode
  screen: CanvasRect
  zoom: number
  selected: boolean
  /** Part of a selection of two or more: marked plainly whatever the selection style. */
  multiSelected?: boolean
  /** The only selected card: the active window, glowing so it stands apart. */
  focused?: boolean
  /** Connect mode is waiting and this card could be the other end. */
  connectTarget?: boolean
  wiringSource: boolean
  live: boolean
  /** The session's live agent status, as the rest of Orca reports it. */
  agentState: CardAgentState
  /** How a selected card is marked; the board's appearance decides. */
  selection: CanvasSelectionPaint
  noteBody: string
  onHeaderPointerDown: (event: React.PointerEvent, node: CanvasNode) => void
  onPortPointerDown: (event: React.PointerEvent, node: CanvasNode) => void
  onSelect: (node: CanvasNode) => void
  onOpen: (node: CanvasNode) => void
  /** Ref callback for the element a live terminal is portaled into; absent keeps the card static. */
  liveSlotRef?: (element: HTMLElement | null) => void
  /** Custom body (e.g. a portal page); replaces the default per-kind body. */
  body?: React.ReactNode
  /** Extra header items (e.g. the bridge menu), at the header's right end. */
  headerActions?: React.ReactNode
  /** Clicking a blurred card's placeholder reveals it. */
  onReveal?: (node: CanvasNode) => void
}

/**
 * What a blurred card shows instead of its body: the reference's faint EyeOff
 * button, which reveals the card. The body is not rendered underneath, so a
 * live terminal stays hidden rather than merely dimmed.
 */
function RedactedBody(props: { onReveal: () => void }): React.JSX.Element {
  const label = translate('auto.components.agentCanvas.removeBlur', 'Remove blur')
  return (
    <div className="flex size-full items-center justify-center">
      <button
        type="button"
        aria-label={label}
        title={label}
        className="flex size-11 items-center justify-center rounded-md text-foreground/25 transition-colors hover:text-foreground/40"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={props.onReveal}
      >
        <EyeOff className="size-[22px]" />
      </button>
    </div>
  )
}

/** Corner marks for the selection styles that use them. */
function SelectionMarks(props: { marks: 'brackets' | 'dots' }): React.JSX.Element {
  const positions =
    props.marks === 'dots'
      ? ['left-1 top-1', 'right-1 top-1', 'left-1 bottom-1', 'right-1 bottom-1']
      : [
          'left-0 top-0 border-l-2 border-t-2',
          'right-0 top-0 border-r-2 border-t-2',
          'left-0 bottom-0 border-b-2 border-l-2',
          'right-0 bottom-0 border-b-2 border-r-2'
        ]
  return (
    <>
      {positions.map((position) => (
        <span
          key={position}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute',
            props.marks === 'dots'
              ? 'size-1.5 rounded-full bg-canvas-accent'
              : 'size-2 rounded-sm border-canvas-accent',
            position
          )}
        />
      ))}
    </>
  )
}

function noteColor(node: CanvasNode): CanvasNoteColor {
  return parseNoteColor(node.content.kind === 'note' ? node.content.color : undefined) ?? 'yellow'
}

/**
 * Hosts the borrowed xterm. The card scales as a whole, so this box stays at
 * world size: zooming the canvas never resizes the PTY, which would reflow a
 * running agent's TUI mid-turn.
 */
function LiveTerminalSlot(props: {
  node: CanvasNode
  slotRef: (element: HTMLElement | null) => void
}): React.JSX.Element {
  return (
    <div
      data-canvas-live-pane=""
      className="relative shrink-0 overflow-hidden bg-editor-surface"
      style={{
        width: props.node.frame.width,
        height: Math.max(0, props.node.frame.height - CARD_HEADER_HEIGHT.session)
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div ref={props.slotRef} className="absolute inset-0" />
    </div>
  )
}

/** The header the reference draws for this kind of card; a text block has none. */
function CardHeader(props: {
  node: CanvasNode
  state: CardAgentState
  drag: CardHeaderDrag
  trailing?: React.ReactNode
}): React.JSX.Element | null {
  const { node, drag } = props
  const content = node.content
  switch (content.kind) {
    case 'session':
      return (
        <SessionCardHeader
          node={{ ...node, content }}
          state={props.state}
          drag={drag}
          trailing={props.trailing}
        />
      )
    case 'portal':
      return content.chromeHidden === true ? null : (
        <PortalCardHeader node={{ ...node, content }} drag={drag} />
      )
    case 'note':
      return <NoteCardHeader node={{ ...node, content }} drag={drag} trailing={props.trailing} />
    case 'fileTree':
      return <FileTreeCardHeader node={{ ...node, content }} drag={drag} />
    default:
      return null
  }
}

/**
 * A canvas card. It is positioned and scaled with one transform rather than
 * sizing each child by zoom, so text, icons and buttons keep their proportions
 * at every zoom level — the way Maestri's nodes behave. The paint is the
 * reference's: an opaque --bg card, rounded-lg, with --shadow-node (deeper
 * when selected); a note is its paper colour, flat; a text block is bare text.
 */
export function AgentCanvasNodeCard(props: AgentCanvasNodeCardProps): React.JSX.Element {
  const { node, screen, zoom, selected, wiringSource, live, noteBody } = props
  const kind = node.content.kind
  const note = kind === 'note' ? node.content : null
  const isText = kind === 'text'
  const bodyId = note?.noteId ?? null
  const drag: CardHeaderDrag = {
    'data-canvas-card-header': '',
    onPointerDown: (event) => props.onHeaderPointerDown(event, node)
  }
  return (
    <div
      data-canvas-node-id={node.id}
      data-canvas-node-kind={kind}
      className={cn(
        'absolute flex flex-col',
        // The reference's rounded-lg is 8px; Orca's theme widens rounded-lg, so it is pinned.
        isText ? 'overflow-visible' : 'overflow-hidden rounded-[8px]',
        // Why the paint comes from the board: the reference offers five ways to show a
        // selected card, and the user picks one for the whole canvas.
        // Why no shadow utility while multi-selected: utilities outrank the plain
        // class, and canvas-node-multiselected owns the box-shadow (edge, halo, lift).
        isText || props.multiSelected || props.focused
          ? null
          : selected && props.selection.boxShadow === 'elevated'
            ? 'canvas-node-shadow-selected'
            : 'canvas-node-shadow',
        selected &&
          props.selection.border === 'dashed' &&
          'border border-dashed border-canvas-accent',
        selected && props.selection.border === 'solid' && 'border border-canvas-accent',
        note
          ? NOTE_PAPER_CLASS[noteColor(node)]
          : isText
            ? 'text-foreground'
            : 'bg-canvas-card-bg text-foreground',
        kind === 'fileTree' && 'border border-canvas-card-border',
        node.locked === true && 'opacity-80',
        // Why its own mark: the board's selection style can be as quiet as a lifted
        // shadow, which tells one card apart but not which ten a rectangle caught.
        props.multiSelected && 'canvas-node-multiselected',
        props.focused && 'canvas-node-focused',
        props.connectTarget && 'canvas-node-connect-target',
        wiringSource && !props.multiSelected && 'ring-2 ring-canvas-accent'
      )}
      style={{
        left: 0,
        top: 0,
        width: node.frame.width,
        height: node.frame.height,
        transformOrigin: 'top left',
        transform: `translate(${screen.x}px, ${screen.y}px) scale(${zoom})`
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
        props.onSelect(node)
      }}
      onDoubleClick={() => props.onOpen(node)}
    >
      <CardHeader node={node} state={props.agentState} drag={drag} trailing={props.headerActions} />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {canvasNodeRedacted(node) ? (
          <RedactedBody onReveal={() => props.onReveal?.(node)} />
        ) : props.body ? (
          props.body
        ) : isText ? (
          <AgentCanvasTextBlockBody node={node} text={noteBody} selected={selected} drag={drag} />
        ) : bodyId !== null ? (
          <textarea
            className="scrollbar-sleek size-full resize-none bg-transparent px-2.5 py-2 text-xs leading-relaxed outline-none placeholder:opacity-40"
            value={noteBody}
            readOnly={note?.readOnly ?? false}
            aria-label={translate('auto.components.agentCanvas.noteUntitled', 'Note')}
            placeholder={translate(
              'auto.components.agentCanvas.notePlaceholder',
              'Write a note for connected agents…'
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => writeCanvasNote(bodyId, event.target.value)}
          />
        ) : kind === 'session' && live && props.liveSlotRef ? (
          <LiveTerminalSlot node={node} slotRef={props.liveSlotRef} />
        ) : (
          <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
            {translate(
              'auto.components.agentCanvas.sessionHint',
              'Double-click to open this session'
            )}
          </div>
        )}
      </div>
      {selected && props.selection.marks !== 'none' ? (
        <SelectionMarks marks={props.selection.marks} />
      ) : null}
      <button
        type="button"
        className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full border border-canvas-rope bg-canvas-surface opacity-0 hover:opacity-100"
        aria-label={translate('auto.components.agentCanvas.wireFrom', 'Drag to connect')}
        onPointerDown={(event) => props.onPortPointerDown(event, node)}
      />
    </div>
  )
}
