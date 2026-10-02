import React from 'react'
import { Crown, StickyNote, SquareTerminal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { CanvasNode, CanvasRect } from '../../../../shared/spatial-canvas/types'
import { writeCanvasNote } from './agent-canvas-store'

type AgentCanvasNodeCardProps = {
  node: CanvasNode
  screen: CanvasRect
  zoom: number
  selected: boolean
  wiringSource: boolean
  live: boolean
  noteBody: string
  onHeaderPointerDown: (event: React.PointerEvent, node: CanvasNode) => void
  onPortPointerDown: (event: React.PointerEvent, node: CanvasNode) => void
  onSelect: (node: CanvasNode) => void
  onOpen: (node: CanvasNode) => void
  onRemove: (node: CanvasNode) => void
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
  return node.content.kind
}

export function AgentCanvasNodeCard(props: AgentCanvasNodeCardProps): React.JSX.Element {
  const { node, screen, zoom, selected, wiringSource, live, noteBody } = props
  const isSession = node.content.kind === 'session'
  const isNote = node.content.kind === 'note'
  const Icon = isSession ? SquareTerminal : StickyNote
  return (
    <div
      data-canvas-node-id={node.id}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
        wiringSource && 'ring-2 ring-primary'
      )}
      style={{ left: screen.x, top: screen.y, width: screen.width, height: screen.height }}
      onPointerDown={(event) => {
        event.stopPropagation()
        props.onSelect(node)
      }}
      onDoubleClick={() => props.onOpen(node)}
    >
      <div
        className={cn(
          'flex shrink-0 cursor-grab items-center gap-2 border-b border-border px-2 py-1.5 active:cursor-grabbing',
          isNote ? 'bg-annotation-highlight/10' : 'bg-muted/40'
        )}
        onPointerDown={(event) => props.onHeaderPointerDown(event, node)}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {nodeTitle(node, noteBody)}
        </span>
        {node.content.kind === 'session' && node.content.isLead ? (
          <Crown className="size-3.5 shrink-0 text-annotation-highlight" />
        ) : null}
        {isSession ? (
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              live ? 'bg-workspace-status-done' : 'bg-muted-foreground/40'
            )}
            title={
              live
                ? translate('auto.components.agentCanvas.sessionLive', 'Session open')
                : translate('auto.components.agentCanvas.sessionGone', 'Session closed')
            }
          />
        ) : null}
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={translate('auto.components.agentCanvas.removeNode', 'Remove from canvas')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => props.onRemove(node)}
        >
          <X className="size-3" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {node.content.kind === 'note' ? (
          <textarea
            className="size-full resize-none bg-transparent p-2 text-xs outline-none"
            style={{ fontSize: Math.max(10, 12 * zoom) }}
            value={noteBody}
            readOnly={node.content.readOnly}
            placeholder={translate(
              'auto.components.agentCanvas.notePlaceholder',
              'Write a note for connected agents…'
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => {
              if (node.content.kind === 'note') {
                writeCanvasNote(node.content.noteId, event.target.value)
              }
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
            {translate(
              'auto.components.agentCanvas.sessionHint',
              'Double-click to open this session'
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        className="absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-background bg-primary opacity-70 hover:opacity-100"
        aria-label={translate('auto.components.agentCanvas.wireFrom', 'Drag to connect')}
        onPointerDown={(event) => props.onPortPointerDown(event, node)}
      />
    </div>
  )
}
