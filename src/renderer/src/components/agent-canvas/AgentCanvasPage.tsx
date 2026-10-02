import React from 'react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  nextZoomLevel,
  screenToWorld,
  worldRectToScreen,
  zoomAtPoint
} from '../../../../shared/spatial-canvas/geometry'
import { levelContents } from '../../../../shared/spatial-canvas/levels'
import type {
  CanvasNode,
  CanvasNoteColor,
  CanvasPortalContent
} from '../../../../shared/spatial-canvas/types'
import { addCanvasPortal } from './agent-canvas-level-actions'
import { canvasGridStyle } from './agent-canvas-grid'
import { parseNoteColor } from './agent-canvas-note-paper'
import { AgentCanvasNoteColorPicker } from './AgentCanvasNoteColorPicker'
import { liveSessionsFromTabs } from './agent-canvas-sessions'
import {
  addCanvasNote,
  disconnectCanvasEdge,
  getAgentCanvasState,
  removeCanvasNode,
  selectCanvasNode,
  setCanvasViewState,
  setCanvasViewport,
  startCanvasHostSync,
  useAgentCanvas
} from './agent-canvas-store'
import { AgentCanvasBridgeMarkers } from './AgentCanvasBridgeMarkers'
import { AgentCanvasBridgeMenu } from './AgentCanvasBridgeMenu'
import { AgentCanvasDrawings, isDrawingNode } from './AgentCanvasDrawings'
import { AgentCanvasHeader } from './AgentCanvasHeader'
import { AgentCanvasLevelBar } from './AgentCanvasLevelBar'
import { AgentCanvasNodeCard } from './AgentCanvasNodeCard'
import { AgentCanvasPortalBody } from './AgentCanvasPortalBody'
import { AgentCanvasRopes } from './AgentCanvasRopes'
import { useAgentCanvasDraw } from './use-agent-canvas-draw'
import { useAgentCanvasGestures } from './use-agent-canvas-gestures'
import { useAgentCanvasLivePanes } from './use-agent-canvas-live-panes'

function isPortalNode(node: CanvasNode): node is CanvasNode & { content: CanvasPortalContent } {
  return node.content.kind === 'portal'
}

function noteColorOf(node: CanvasNode): CanvasNoteColor {
  return parseNoteColor(node.content.kind === 'note' ? node.content.color : undefined) ?? 'yellow'
}

export default function AgentCanvasPage(): React.JSX.Element {
  const closeCanvasPage = useAppStore((state) => state.closeCanvasPage)
  const tabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const setActiveWorktree = useAppStore((state) => state.setActiveWorktree)
  const activateTab = useAppStore((state) => state.activateTab)
  const document = useAgentCanvas((state) => state.document)
  const viewport = useAgentCanvas((state) => state.viewport)
  const notes = useAgentCanvas((state) => state.notes)
  const selectedNodeId = useAgentCanvas((state) => state.selectedNodeId)
  const activeLevelId = useAgentCanvas((state) => state.activeLevelId)
  const drawTool = useAgentCanvas((state) => state.drawTool)
  const surfaceRef = React.useRef<HTMLDivElement | null>(null)
  const gestures = useAgentCanvasGestures(surfaceRef)
  const draw = useAgentCanvasDraw(surfaceRef)
  const livePanes = useAgentCanvasLivePanes(selectedNodeId)

  const liveSessions = React.useMemo(() => liveSessionsFromTabs(tabsByWorktree), [tabsByWorktree])
  const liveById = React.useMemo(
    () => new Map(liveSessions.map((session) => [session.sessionId, session])),
    [liveSessions]
  )

  // Why: placing new sessions is AgentCanvasBackgroundSync's job (app-wide); the open page
  // only polls faster so agent note writes and placements show up promptly.
  React.useEffect(() => startCanvasHostSync(), [])

  // Why: each floor is its own plane; only the active one's cards and wires are drawn.
  const floor = levelContents(document, activeLevelId) ?? document.root
  const nodes = [...floor.nodes].sort((left, right) => left.zIndex - right.zIndex)
  // Why: bridge markers draw as pills on both floors (AgentCanvasBridgeMarkers), not as cards.
  const cards = nodes.filter((node) => !isDrawingNode(node) && node.content.kind !== 'bridge')

  const surfaceCenterWorld = (): { x: number; y: number } => {
    const surface = surfaceRef.current
    const center = surface
      ? { x: surface.clientWidth / 2, y: surface.clientHeight / 2 }
      : { x: 0, y: 0 }
    return screenToWorld(center, getAgentCanvasState().viewport)
  }

  const zoomBy = (direction: 1 | -1): void => {
    const surface = surfaceRef.current
    const center = surface
      ? { x: surface.clientWidth / 2, y: surface.clientHeight / 2 }
      : { x: 0, y: 0 }
    const current = getAgentCanvasState().viewport
    setCanvasViewport(zoomAtPoint(current, nextZoomLevel(current.zoom, direction, null), center))
  }

  const addPortalAtCenter = (): void => {
    const raw = window.prompt(
      translate(
        'auto.components.agentCanvas.portalPrompt',
        'URL to pin on the canvas (e.g. localhost:3000)'
      )
    )
    if (raw && !addCanvasPortal(raw, surfaceCenterWorld())) {
      window.alert(
        translate('auto.components.agentCanvas.portalInvalid', 'Only http(s) pages can be pinned.')
      )
    }
  }

  const liveSlotFor = (node: CanvasNode): ((element: HTMLElement | null) => void) | undefined => {
    if (node.content.kind !== 'session') {
      return undefined
    }
    const session = liveById.get(node.content.sessionId)
    return session
      ? livePanes.registerSlot({
          nodeId: node.id,
          sessionId: session.sessionId,
          worktreeId: session.worktreeId
        })
      : undefined
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
      // Why: keys typed into a live terminal, note or portal belong to it, not the canvas.
      if (
        target?.matches(
          'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
        ) ||
        target?.closest('[data-canvas-live-pane]')
      ) {
        return
      }
      const state = getAgentCanvasState()
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedNodeId) {
        event.preventDefault()
        removeCanvasNode(state.selectedNodeId)
      } else if (event.key === 'Escape') {
        if (state.drawTool) {
          setCanvasViewState({ drawTool: null })
        } else if (state.selectedNodeId) {
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
    <div className="flex h-full min-h-0 flex-col">
      <AgentCanvasHeader
        zoom={viewport.zoom}
        onBack={closeCanvasPage}
        onAddNote={() => addCanvasNote(surfaceCenterWorld())}
        onZoom={zoomBy}
      />
      <div
        ref={surfaceRef}
        className={cn(
          'relative min-h-0 flex-1 touch-none overflow-hidden',
          drawTool && 'cursor-crosshair'
        )}
        style={canvasGridStyle(viewport, window.devicePixelRatio)}
        onPointerDown={(event) => {
          if (!draw.onPointerDown(event)) {
            gestures.onSurfacePointerDown(event)
          }
        }}
      >
        <AgentCanvasDrawings
          nodes={nodes}
          viewport={viewport}
          draft={draw.draft?.shape ?? null}
          draftOrigin={draw.draft?.origin ?? null}
          selectedNodeId={selectedNodeId}
          onSelect={(target) => selectCanvasNode(target.id)}
        />
        <AgentCanvasRopes
          nodes={nodes}
          edges={floor.edges}
          viewport={viewport}
          pending={gestures.pendingWire}
          onDisconnect={(edge) => disconnectCanvasEdge(edge.id)}
        />
        <AgentCanvasBridgeMarkers document={document} levelId={activeLevelId} viewport={viewport} />
        {/* Why inside the surface and absolutely positioned: the toolbar is placed on the
            board, over the graph paper, rather than contributing a row above it. */}
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <AgentCanvasLevelBar document={document} onAddPortal={addPortalAtCenter} />
        </div>
        {cards.map((node) => (
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
            liveSlotRef={liveSlotFor(node)}
            headerActions={
              node.content.kind === 'session' ? (
                <AgentCanvasBridgeMenu document={document} node={node} />
              ) : node.content.kind === 'note' ? (
                <AgentCanvasNoteColorPicker nodeId={node.id} color={noteColorOf(node)} />
              ) : undefined
            }
            body={
              isPortalNode(node) ? (
                <AgentCanvasPortalBody node={node} interactive={node.id === selectedNodeId} />
              ) : undefined
            }
          />
        ))}
        {nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {activeLevelId === null
              ? translate(
                  'auto.components.agentCanvas.empty',
                  'Open a terminal session and it will appear here.'
                )
              : translate(
                  'auto.components.agentCanvas.emptyFloor',
                  'Empty floor. Shift-click this floor with a card selected to move it here.'
                )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
