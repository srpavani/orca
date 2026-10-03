import React from 'react'
import { EyeOff, FolderTree, Globe, Lock, SquareTerminal, StickyNote, Type, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type {
  CanvasNode,
  CanvasNoteColor,
  CanvasRect,
  CanvasSessionContent
} from '../../../../shared/spatial-canvas/types'
import { AgentCanvasCardControls } from './AgentCanvasCardControls'
import type { CanvasSelectionPaint } from '../../../../shared/spatial-canvas/canvas-appearance'
import type { CardAgentState } from './agent-canvas-card-status'
import { canvasNodeRedacted } from '../../../../shared/spatial-canvas/node-display'
import { writeCanvasNote } from './agent-canvas-store'
import { NOTE_PAPER_CLASS, parseNoteColor } from './agent-canvas-note-paper'

type AgentCanvasNodeCardProps = {
  node: CanvasNode
  screen: CanvasRect
  zoom: number
  selected: boolean
  /** Part of a selection of two or more: marked plainly whatever the selection style. */
  multiSelected?: boolean
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
  onRemove: (node: CanvasNode) => void
  /** Ref callback for the element a live terminal is portaled into; absent keeps the card static. */
  liveSlotRef?: (element: HTMLElement | null) => void
  /** Custom body (e.g. a portal page); replaces the default per-kind body. */
  body?: React.ReactNode
  /** Extra header buttons (e.g. the bridge menu), shown before the remove button. */
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
  if (props.marks === 'dots') {
    return (
      <>
        {['left-1 top-1', 'right-1 top-1', 'left-1 bottom-1', 'right-1 bottom-1'].map(
          (position) => (
            <span
              key={position}
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute size-1.5 rounded-full bg-canvas-accent',
                position
              )}
            />
          )
        )}
      </>
    )
  }
  return (
    <>
      {[
        'left-0 top-0 border-l-2 border-t-2',
        'right-0 top-0 border-r-2 border-t-2',
        'left-0 bottom-0 border-b-2 border-l-2',
        'right-0 bottom-0 border-b-2 border-r-2'
      ].map((position) => (
        <span
          key={position}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute size-2 rounded-sm border-canvas-accent',
            position
          )}
        />
      ))}
    </>
  )
}

/** Maestri's card header is 16px at 100%; two px more here to fit the header buttons. */
const HEADER_HEIGHT = 18

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
        height: Math.max(0, props.node.frame.height - HEADER_HEIGHT)
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div ref={props.slotRef} className="absolute inset-0" />
    </div>
  )
}

function nodeTitle(node: CanvasNode, noteBody: string): string {
  if (node.content.kind === 'session') {
    return node.content.label
  }
  if (node.content.kind === 'note') {
    const firstLine = noteBody.split('\n').find((line) => line.trim().length > 0)
    return (
      node.content.pinnedName ??
      firstLine?.trim() ??
      translate('auto.components.agentCanvas.untitledNote', 'Untitled note')
    )
  }
  if (node.content.kind === 'fileTree') {
    return node.content.rootName
  }
  if (node.content.kind === 'text') {
    const firstLine = noteBody.split('\n').find((line) => line.trim().length > 0)
    return (
      node.content.pinnedName ??
      firstLine?.trim() ??
      translate('auto.components.agentCanvas.untitledText', 'Text block')
    )
  }
  if (node.content.kind === 'portal') {
    return node.content.url.replace(/^https?:\/\//, '')
  }
  return node.content.kind
}

/**
 * A canvas card. It is positioned and scaled with one transform rather than
 * sizing each child by zoom, so text, icons and buttons keep their proportions
 * at every zoom level — the way Maestri's nodes behave.
 */
export function AgentCanvasNodeCard(props: AgentCanvasNodeCardProps): React.JSX.Element {
  const { node, screen, zoom, selected, wiringSource, live, noteBody } = props
  const session = node.content.kind === 'session' ? node.content : null
  const note = node.content.kind === 'note' ? node.content : null
  const text = node.content.kind === 'text' ? node.content : null
  const isSession = session !== null
  const isNote = note !== null
  const isText = text !== null
  const body = note?.noteId ?? text?.textId ?? null
  const locked = node.locked === true
  const Icon = isSession
    ? SquareTerminal
    : node.content.kind === 'portal'
      ? Globe
      : node.content.kind === 'fileTree'
        ? FolderTree
        : isText
          ? Type
          : StickyNote
  return (
    <div
      data-canvas-node-id={node.id}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-xl',
        // Why the paint comes from the board: the reference offers five ways to show a
        // selected card, and the user picks one for the whole canvas.
        // Why no shadow utility while multi-selected: utilities outrank the plain
        // class, and canvas-node-multiselected owns the box-shadow (edge, halo, lift).
        props.multiSelected
          ? null
          : selected && props.selection.boxShadow === 'elevated'
            ? 'canvas-node-shadow-selected'
            : 'canvas-node-shadow',
        selected &&
          props.selection.border === 'dashed' &&
          'border border-dashed border-canvas-accent',
        selected && props.selection.border === 'solid' && 'border border-canvas-accent',
        isNote ? NOTE_PAPER_CLASS[noteColor(node)] : 'bg-card text-card-foreground',
        isText && 'bg-transparent shadow-none ring-1 ring-foreground/15',
        locked && 'opacity-80',
        // Why its own mark: the board's selection style can be as quiet as a lifted
        // shadow, which tells one card apart but not which ten a rectangle caught.
        props.multiSelected && 'canvas-node-multiselected',
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
      <div
        data-canvas-card-header=""
        className="relative flex shrink-0 cursor-grab items-center gap-1.5 overflow-hidden px-2 active:cursor-grabbing"
        style={{ height: HEADER_HEIGHT }}
        onPointerDown={(event) => props.onHeaderPointerDown(event, node)}
      >
        {/* Why an overlay rather than a background on the strip: the note's paper colour has
            to stay flat underneath, or the header and the body disagree at their seam. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'var(--canvas-header-tint)' }}
        />
        <Icon className="relative size-3 shrink-0 opacity-60" />
        <span className="relative min-w-0 flex-1 truncate text-[11px] font-medium leading-none">
          {nodeTitle(node, noteBody)}
        </span>
        {session ? (
          <AgentCanvasCardControls
            node={node as CanvasNode & { content: CanvasSessionContent }}
            state={props.agentState}
            live={live}
          />
        ) : null}
        {locked ? <Lock className="relative size-3 shrink-0 opacity-60" /> : null}
        {props.headerActions ? <span className="relative">{props.headerActions}</span> : null}
        <button
          type="button"
          className="relative shrink-0 rounded p-0.5 opacity-50 hover:bg-foreground/10 hover:opacity-100"
          aria-label={translate('auto.components.agentCanvas.removeNode', 'Remove from canvas')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => props.onRemove(node)}
        >
          <X className="size-3" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {canvasNodeRedacted(node) ? (
          <RedactedBody onReveal={() => props.onReveal?.(node)} />
        ) : props.body ? (
          props.body
        ) : body !== null ? (
          <textarea
            className={cn(
              'size-full resize-none bg-transparent p-2.5 text-xs leading-relaxed outline-none placeholder:opacity-40',
              isText && 'text-[13px] leading-relaxed'
            )}
            value={noteBody}
            readOnly={note?.readOnly ?? false}
            placeholder={
              isText
                ? translate(
                    'auto.components.agentCanvas.textPlaceholder',
                    'Write text for the board…'
                  )
                : translate(
                    'auto.components.agentCanvas.notePlaceholder',
                    'Write a note for connected agents…'
                  )
            }
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => {
              writeCanvasNote(body, event.target.value)
            }}
          />
        ) : isSession && live && props.liveSlotRef ? (
          <LiveTerminalSlot node={node} slotRef={props.liveSlotRef} />
        ) : (
          <div className="flex size-full items-center justify-center p-3 text-center text-xs opacity-50">
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
