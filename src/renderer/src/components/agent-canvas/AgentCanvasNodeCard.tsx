import React from 'react'
import { Globe, StickyNote, SquareTerminal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type {
  CanvasNode,
  CanvasNoteColor,
  CanvasRect,
  CanvasSessionContent
} from '../../../../shared/spatial-canvas/types'
import { AgentCanvasCardControls } from './AgentCanvasCardControls'
import type { CardAgentState } from './agent-canvas-card-status'
import { writeCanvasNote } from './agent-canvas-store'
import { NOTE_PAPER_CLASS, parseNoteColor } from './agent-canvas-note-paper'

type AgentCanvasNodeCardProps = {
  node: CanvasNode
  screen: CanvasRect
  zoom: number
  selected: boolean
  wiringSource: boolean
  live: boolean
  /** The session's live agent status, as the rest of Orca reports it. */
  agentState: CardAgentState
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
  const isSession = session !== null
  const isNote = note !== null
  const Icon = isSession ? SquareTerminal : node.content.kind === 'portal' ? Globe : StickyNote
  return (
    <div
      data-canvas-node-id={node.id}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-xl',
        // Why a shadow and not a coloured ring: on a spatial canvas the selected card is the one
        // that looks lifted off the surface. Maestri's nodes read the same way.
        selected ? 'canvas-node-shadow-selected' : 'canvas-node-shadow',
        isNote ? NOTE_PAPER_CLASS[noteColor(node)] : 'bg-card text-card-foreground',
        wiringSource && 'ring-2 ring-canvas-accent'
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
        {props.body ? (
          props.body
        ) : isNote ? (
          <textarea
            className="size-full resize-none bg-transparent p-2.5 text-xs leading-relaxed outline-none placeholder:opacity-40"
            value={noteBody}
            readOnly={note?.readOnly ?? false}
            placeholder={translate(
              'auto.components.agentCanvas.notePlaceholder',
              'Write a note for connected agents…'
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => {
              if (note) {
                writeCanvasNote(note.noteId, event.target.value)
              }
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
      <button
        type="button"
        className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full border border-canvas-rope bg-canvas-surface opacity-0 hover:opacity-100"
        aria-label={translate('auto.components.agentCanvas.wireFrom', 'Drag to connect')}
        onPointerDown={(event) => props.onPortPointerDown(event, node)}
      />
    </div>
  )
}
