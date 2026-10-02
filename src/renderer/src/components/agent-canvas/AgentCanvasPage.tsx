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
import { buildFloorStack } from '../../../../shared/spatial-canvas/floor-stack'
import { levelContents, levelsOf } from '../../../../shared/spatial-canvas/levels'
import type {
  CanvasNode,
  CanvasNoteColor,
  CanvasPortalContent
} from '../../../../shared/spatial-canvas/types'
import { addCanvasPortal } from './agent-canvas-level-actions'
import { agentStatusForNode, cardAgentState } from './agent-canvas-card-status'
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
import { AgentCanvasFloorList } from './AgentCanvasFloorList'
import { AgentCanvasFloorStack } from './AgentCanvasFloorStack'
import { AgentCanvasHeader } from './AgentCanvasHeader'
import { AgentCanvasLevelBar } from './AgentCanvasLevelBar'
import { AgentCanvasNodeCard } from './AgentCanvasNodeCard'
import { AgentCanvasPortalBody } from './AgentCanvasPortalBody'
import { AgentCanvasPromptDialog } from './AgentCanvasPromptDialog'
import { openCanvasPrompt } from './agent-canvas-prompt'
import { AgentCanvasRopes } from './AgentCanvasRopes'
import { useAgentCanvasDraw } from './use-agent-canvas-draw'
import { useAgentCanvasGestures } from './use-agent-canvas-gestures'
import { useAgentCanvasLivePanes } from './use-agent-canvas-live-panes'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'
import { useStageHeight } from './use-stage-height'

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
  const floorOverview = useAgentCanvas((state) => state.floorOverview)
  const surfaceRef = React.useRef<HTMLDivElement | null>(null)
  const stageHeight = useStageHeight(surfaceRef)
  const prefersReducedMotion = usePrefersReducedMotion()
  // Why the same source the tab bar uses: a card must not disagree with the
  // rest of Orca about whether its agent is working.
  const layouts = useAppStore((state) => state.terminalLayoutsByTabId)
  const statusByPaneKey = useAppStore((state) => state.agentStatusByPaneKey)
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

  // Why each floor is its own plane; only the active one's cards and wires are drawn.
  const floor = levelContents(document, activeLevelId) ?? document.root
  const nodes = [...floor.nodes].sort((left, right) => left.zIndex - right.zIndex)
  // Why: bridge markers draw as pills on both floors (AgentCanvasBridgeMarkers), not as cards.
  const cards = nodes.filter((node) => !isDrawingNode(node) && node.content.kind !== 'bridge')

  // The stack's geometry needs every floor, not just the live one: the sheets above
  // and below are what the overview exists to show.
  const floorStack = React.useMemo(
    () =>
      buildFloorStack(
        levelsOf(document).map((level) => ({
          id: level.id,
          name:
            level.id === null
              ? translate('auto.components.agentCanvas.groundFloor', 'Ground')
              : level.name,
          // Floors carry no colour in this port yet, so every sheet uses the hairline ring.
          color: null,
          items: level.contents.nodes.length
        })),
        activeLevelId
      ),
    [document, activeLevelId]
  )

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
    openCanvasPrompt({
      kind: 'text',
      title: translate('auto.components.agentCanvas.addPortal', 'Portal'),
      description: translate(
        'auto.components.agentCanvas.portalPrompt',
        'URL to pin on the canvas (e.g. localhost:3000)'
      ),
      label: translate('auto.components.agentCanvas.portalUrlLabel', 'Page URL'),
      placeholder: 'http://localhost:3000',
      confirmLabel: translate('auto.components.agentCanvas.pin', 'Pin'),
      onSubmit: (raw) => {
        if (!addCanvasPortal(raw, surfaceCenterWorld())) {
          openCanvasPrompt({
            kind: 'notice',
            title: translate(
              'auto.components.agentCanvas.portalInvalid',
              'Only http(s) pages can be pinned.'
            ),
            confirmLabel: translate('auto.components.agentCanvas.ok', 'OK'),
            onSubmit: () => {}
          })
        }
      }
    })
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
        style={{ backgroundColor: 'var(--color-canvas-surface)' }}
        onPointerDown={(event) => {
          // Why a click closes the stack: a tilted sheet must not pan or draw, and
          // the reference treats the overview as something you step out of.
          if (floorOverview) {
            setCanvasViewState({ floorOverview: false })
            return
          }
          if (!draw.onPointerDown(event)) {
            gestures.onSurfacePointerDown(event)
          }
        }}
      >
        <AgentCanvasFloorStack
          stack={floorStack}
          live={floorOverview}
          stageHeight={stageHeight}
          reduceMotion={prefersReducedMotion}
        >
          <div
            className={cn('absolute inset-0', floorOverview && 'pointer-events-none')}
            style={canvasGridStyle(viewport, window.devicePixelRatio)}
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
            <AgentCanvasBridgeMarkers
              document={document}
              levelId={activeLevelId}
              viewport={viewport}
            />
            {cards.map((node) => (
              <AgentCanvasNodeCard
                key={node.id}
                node={node}
                screen={worldRectToScreen(node.frame, viewport)}
                zoom={viewport.zoom}
                selected={node.id === selectedNodeId}
                wiringSource={gestures.pendingWire?.fromNode.id === node.id}
                live={node.content.kind === 'session' && liveById.has(node.content.sessionId)}
                agentState={cardAgentState(agentStatusForNode(node, layouts, statusByPaneKey))}
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
        </AgentCanvasFloorStack>
        {/* Why outside the stack: the chrome must not tilt with the sheets. The
            toolbar also hides in the overview, which is what the reference does —
            the stack is a mode, and the stack's own list carries the actions. */}
        {floorOverview ? null : (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
            <AgentCanvasLevelBar onAddPortal={addPortalAtCenter} />
          </div>
        )}
        <AgentCanvasFloorList document={document} stageHeight={stageHeight} />
        <AgentCanvasPromptDialog />
      </div>
    </div>
  )
}
