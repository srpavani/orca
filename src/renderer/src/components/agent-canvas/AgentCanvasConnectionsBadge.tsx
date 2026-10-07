import React from 'react'
import { FileText, FolderTree, Globe, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import { canvasEdgesOf, disconnectCanvasEdges } from './agent-canvas-connect-mode'
import { TerminalWindowIcon } from './AgentCanvasIcons'
import { selectCanvasNode, useAgentCanvas } from './agent-canvas-store'

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
    case 'text':
    case 'stack':
    case 'drawing':
    case 'bridge':
      return translate('auto.components.agentCanvas.cardTitle', 'Card')
  }
}

/** The reference's ConnectionRowIcon: what the far end of a wire is. */
function RowIcon(props: { node: CanvasNode | undefined }): React.JSX.Element {
  const kind = props.node?.content.kind
  const className = 'size-3.5 shrink-0 text-muted-foreground'
  if (kind === 'session') {
    return <TerminalWindowIcon className={className} />
  }
  if (kind === 'portal') {
    return <Globe className={className} />
  }
  if (kind === 'fileTree') {
    return <FolderTree className={className} />
  }
  return <FileText className={className} />
}

/**
 * The reference's ConnectionsBadge: a solid accent pill with the wire count
 * (99+ past 99); its popover lists the far ends to jump to, one remove per row,
 * and Remove All. Hidden while the card has no wires.
 */
export function AgentCanvasConnectionsBadge(props: {
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
  const manage = translate('auto.components.agentCanvas.manageConnections', 'Manage Connections')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={manage}
          title={manage}
          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-canvas-accent px-1 text-[10px] font-bold text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {edges.length > 99 ? '99+' : edges.length}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="bottom"
        sideOffset={8}
        aria-label={translate('auto.components.agentCanvas.connections', 'Connections')}
        className="w-64"
      >
        <div className="flex items-center justify-between px-1 pb-1.5">
          <h2 className="text-[13px] font-semibold text-foreground">
            {translate('auto.components.agentCanvas.connections', 'Connections')}
          </h2>
          <button
            type="button"
            className="rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              disconnectCanvasEdges(edges.map((edge) => edge.id))
              setOpen(false)
            }}
          >
            {translate('auto.components.agentCanvas.removeAllConnections', 'Remove All')}
          </button>
        </div>
        <ul className="scrollbar-sleek flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {edges.map((edge) => {
            const other = otherEnd(edge)
            const name = other ? titleOf(other) : '?'
            return (
              <li
                key={edge.id}
                className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-foreground/5"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    if (other) {
                      selectCanvasNode(other.id)
                    }
                    setOpen(false)
                  }}
                >
                  <RowIcon node={other} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                    {name}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={translate(
                    'auto.components.agentCanvas.removeConnectionTo',
                    'Remove connection to {{name}}',
                    { name }
                  )}
                  className="shrink-0 rounded p-0.5 text-muted-foreground outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => disconnectCanvasEdges([edge.id])}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
