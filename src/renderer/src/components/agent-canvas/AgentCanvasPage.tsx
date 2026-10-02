import React from 'react'
import { ArrowLeft, Network, StickyNote, ZoomIn, ZoomOut } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { translate } from '@/i18n/i18n'
import {
  nextZoomLevel,
  screenToWorld,
  worldRectToScreen,
  zoomAtPoint
} from '../../../../shared/spatial-canvas/geometry'
import { everyEdge, nodesInDrawOrder } from '../../../../shared/spatial-canvas/levels'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import { liveSessionsFromTabs } from './agent-canvas-sessions'
import {
  addCanvasNote,
  disconnectCanvasEdge,
  getAgentCanvasState,
  removeCanvasNode,
  selectCanvasNode,
  setCanvasViewport,
  startCanvasHostSync,
  syncCanvasSessions,
  useAgentCanvas
} from './agent-canvas-store'
import { AgentCanvasNodeCard } from './AgentCanvasNodeCard'
import { AgentCanvasRopes } from './AgentCanvasRopes'
import { useAgentCanvasGestures } from './use-agent-canvas-gestures'

export default function AgentCanvasPage(): React.JSX.Element {
  const closeCanvasPage = useAppStore((state) => state.closeCanvasPage)
  const tabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const setActiveWorktree = useAppStore((state) => state.setActiveWorktree)
  const activateTab = useAppStore((state) => state.activateTab)
  const document = useAgentCanvas((state) => state.document)
  const viewport = useAgentCanvas((state) => state.viewport)
  const notes = useAgentCanvas((state) => state.notes)
  const selectedNodeId = useAgentCanvas((state) => state.selectedNodeId)
  const surfaceRef = React.useRef<HTMLDivElement | null>(null)
  const gestures = useAgentCanvasGestures(surfaceRef)

  const liveSessions = React.useMemo(() => liveSessionsFromTabs(tabsByWorktree), [tabsByWorktree])
  const liveById = React.useMemo(
    () => new Map(liveSessions.map((session) => [session.sessionId, session])),
    [liveSessions]
  )

  const loaded = useAgentCanvas((state) => state.loaded)

  React.useEffect(() => startCanvasHostSync(), [])

  React.useEffect(() => {
    syncCanvasSessions(liveSessions)
  }, [liveSessions, loaded])

  const nodes = nodesInDrawOrder(document)
  const edges = everyEdge(document)

  const zoomBy = (direction: 1 | -1): void => {
    const surface = surfaceRef.current
    const center = surface
      ? { x: surface.clientWidth / 2, y: surface.clientHeight / 2 }
      : { x: 0, y: 0 }
    const current = getAgentCanvasState().viewport
    setCanvasViewport(zoomAtPoint(current, nextZoomLevel(current.zoom, direction, null), center))
  }

  const addNoteAtCenter = (): void => {
    const surface = surfaceRef.current
    const center = surface
      ? { x: surface.clientWidth / 2, y: surface.clientHeight / 2 }
      : { x: 0, y: 0 }
    addCanvasNote(screenToWorld(center, getAgentCanvasState().viewport))
  }

  const openNode = (node: CanvasNode): void => {
    if (node.content.kind !== 'session') {
      return
    }
    const session = liveById.get(node.content.sessionId)
    if (!session) {
      return
    }
    setActiveWorktree(session.worktreeId)
    activateTab(session.sessionId, { worktreeId: session.worktreeId })
    closeCanvasPage()
  }

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (
        target?.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      ) {
        return
      }
      const selected = getAgentCanvasState().selectedNodeId
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
        event.preventDefault()
        removeCanvasNode(selected)
      } else if (event.key === 'Escape') {
        if (selected) {
          selectCanvasNode(null)
        } else {
          closeCanvasPage()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeCanvasPage])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Button variant="outline" size="sm" onClick={closeCanvasPage} className="shrink-0">
          <ArrowLeft className="size-3.5" />
          {translate('auto.components.agentCanvas.back', 'Back')}
        </Button>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30">
          <Network className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold text-foreground">
              {translate('auto.components.agentCanvas.title', 'Agent Canvas')}
            </h1>
            <Badge variant="secondary">
              {translate('auto.components.agentCanvas.beta', 'Beta')}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {translate(
              'auto.components.agentCanvas.subtitle',
              'Wire sessions together to let their agents ask each other. Cutting a wire revokes access.'
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addNoteAtCenter}>
          <StickyNote className="size-3.5" />
          {translate('auto.components.agentCanvas.addNote', 'Note')}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomBy(-1)}
          aria-label={translate('auto.components.agentCanvas.zoomOut', 'Zoom out')}
        >
          <ZoomOut className="size-4" />
        </Button>
        <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomBy(1)}
          aria-label={translate('auto.components.agentCanvas.zoomIn', 'Zoom in')}
        >
          <ZoomIn className="size-4" />
        </Button>
      </div>
      <div
        ref={surfaceRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-muted/20"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
          backgroundPosition: `${-viewport.origin.x * viewport.zoom}px ${-viewport.origin.y * viewport.zoom}px`
        }}
        onPointerDown={gestures.onSurfacePointerDown}
      >
        <AgentCanvasRopes
          nodes={nodes}
          edges={edges}
          viewport={viewport}
          pending={gestures.pendingWire}
          onDisconnect={(edge) => disconnectCanvasEdge(edge.id)}
        />
        {nodes.map((node) => (
          <AgentCanvasNodeCard
            key={node.id}
            node={node}
            screen={worldRectToScreen(node.frame, viewport)}
            zoom={viewport.zoom}
            selected={node.id === selectedNodeId}
            wiringSource={gestures.pendingWire?.fromNode.id === node.id}
            live={node.content.kind === 'session' && liveById.has(node.content.sessionId)}
            noteBody={node.content.kind === 'note' ? (notes[node.content.noteId] ?? '') : ''}
            onHeaderPointerDown={gestures.onHeaderPointerDown}
            onPortPointerDown={gestures.onPortPointerDown}
            onSelect={(target) => selectCanvasNode(target.id)}
            onOpen={openNode}
            onRemove={(target) => removeCanvasNode(target.id)}
          />
        ))}
        {nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {translate(
              'auto.components.agentCanvas.empty',
              'Open a terminal session and it will appear here.'
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
