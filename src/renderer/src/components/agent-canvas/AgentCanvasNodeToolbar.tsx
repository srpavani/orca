import React from 'react'
import { CopyPlus, ExternalLink, GitBranch, Trash2, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { worldRectToScreen } from '../../../../shared/spatial-canvas/geometry'
import type { CanvasNode, CanvasViewport } from '../../../../shared/spatial-canvas/types'
import {
  canvasEdgesOf,
  disconnectCanvasEdges,
  startCanvasConnect,
  useCanvasConnectingFrom
} from './agent-canvas-connect-mode'
import { duplicateCanvasNode } from './agent-canvas-node-actions'
import { removeCanvasNode, selectCanvasNode, useAgentCanvas } from './agent-canvas-store'

const GAP = 10

function titleOf(node: CanvasNode): string {
  switch (node.content.kind) {
    case 'session':
      return node.content.name ?? node.content.label
    case 'note':
      return node.content.pinnedName ?? translate('auto.components.agentCanvas.noteTitle', 'Note')
    case 'portal':
      return node.content.url.replace(/^https?:\/\//, '')
    case 'fileTree':
      return node.content.rootName
    default:
      return translate('auto.components.agentCanvas.cardTitle', 'Card')
  }
}

function ToolButton(props: {
  label: string
  onClick: () => void
  active?: boolean
  destructive?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
      className={
        props.destructive
          ? 'flex size-7 items-center justify-center rounded-full text-destructive hover:bg-destructive/10'
          : props.active
            ? 'flex size-7 items-center justify-center rounded-full bg-canvas-accent text-primary-foreground'
            : 'flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
      }
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

/** How many wires a card has, and a list to follow or remove them (the reference's ConnectionsBadge). */
function ConnectionsBadge(props: {
  node: CanvasNode
  nodes: readonly CanvasNode[]
}): React.JSX.Element | null {
  const [open, setOpen] = React.useState(false)
  // Re-read on every document change so the count follows wires made or removed.
  useAgentCanvas((state) => state.document)
  const edges = canvasEdgesOf(props.node.id)
  if (edges.length === 0) {
    return null
  }
  const otherEnd = (edge: (typeof edges)[number]): CanvasNode | undefined => {
    const otherId = edge.fromNodeId === props.node.id ? edge.toNodeId : edge.fromNodeId
    return props.nodes.find((node) => node.id === otherId)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={translate('auto.components.agentCanvas.connections', 'Connections')}
          aria-label={translate('auto.components.agentCanvas.connections', 'Connections')}
          className="flex h-5 min-w-5 items-center justify-center rounded-full bg-canvas-accent px-1 text-[10px] font-bold text-primary-foreground"
        >
          {edges.length > 99 ? '99+' : edges.length}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" className="w-64">
        <div className="flex items-center justify-between pb-1.5">
          <span className="text-xs font-semibold">
            {translate('auto.components.agentCanvas.connections', 'Connections')}
          </span>
          <button
            type="button"
            className="rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-foreground/5"
            onClick={() => {
              disconnectCanvasEdges(edges.map((edge) => edge.id))
              setOpen(false)
            }}
          >
            {translate('auto.components.agentCanvas.removeAllConnections', 'Remove all')}
          </button>
        </div>
        <ul className="scrollbar-sleek flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {edges.map((edge) => {
            const other = otherEnd(edge)
            return (
              <li
                key={edge.id}
                className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-foreground/5"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs"
                  onClick={() => {
                    if (other) {
                      selectCanvasNode(other.id)
                    }
                    setOpen(false)
                  }}
                >
                  {other ? titleOf(other) : '?'}
                </button>
                <button
                  type="button"
                  aria-label={translate(
                    'auto.components.agentCanvas.removeConnection',
                    'Remove connection'
                  )}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                  onClick={() => disconnectCanvasEdges([edge.id])}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The reference's contextual toolbar: floating glass above the one selected
 * card, with Connect (then click the other card), the connection count, Open
 * for a terminal, Duplicate and Delete.
 */
export function AgentCanvasNodeToolbar(props: {
  node: CanvasNode
  nodes: readonly CanvasNode[]
  viewport: CanvasViewport
  onOpen: (node: CanvasNode) => void
}): React.JSX.Element {
  const { node } = props
  const connecting = useCanvasConnectingFrom()
  const screen = worldRectToScreen(node.frame, props.viewport)
  const isSession = node.content.kind === 'session'
  const canDuplicate = node.content.kind !== 'session'
  return (
    <div
      data-canvas-node-toolbar=""
      role="toolbar"
      aria-label={translate('auto.components.agentCanvas.cardToolbar', 'Card actions')}
      className="canvas-glass pointer-events-auto absolute z-20 flex h-9 -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-full px-1.5"
      style={{ left: screen.x + screen.width / 2, top: screen.y - GAP }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ToolButton
        label={
          connecting === node.id
            ? translate(
                'auto.components.agentCanvas.connectPickTarget',
                'Click another card to connect'
              )
            : translate('auto.components.agentCanvas.connect', 'Connect')
        }
        active={connecting === node.id}
        onClick={() => startCanvasConnect(node.id)}
      >
        <GitBranch className="size-4" />
      </ToolButton>
      <ConnectionsBadge node={node} nodes={props.nodes} />
      {isSession ? (
        <ToolButton
          label={translate('auto.components.agentCanvas.openSession', 'Open terminal')}
          onClick={() => props.onOpen(node)}
        >
          <ExternalLink className="size-4" />
        </ToolButton>
      ) : null}
      {canDuplicate ? (
        <ToolButton
          label={translate('auto.components.agentCanvas.duplicateNode', 'Duplicate')}
          onClick={() => duplicateCanvasNode(node.id)}
        >
          <CopyPlus className="size-4" />
        </ToolButton>
      ) : null}
      <span className="mx-0.5 h-4 w-px bg-foreground/15" />
      <ToolButton
        label={translate('auto.components.agentCanvas.removeNode', 'Remove from canvas')}
        destructive
        onClick={() => removeCanvasNode(node.id)}
      >
        <Trash2 className="size-4" />
      </ToolButton>
    </div>
  )
}
