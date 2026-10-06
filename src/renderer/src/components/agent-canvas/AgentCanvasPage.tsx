import React from 'react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { screenToWorld, worldRectToScreen } from '../../../../shared/spatial-canvas/geometry'
import { buildFloorStack } from '../../../../shared/spatial-canvas/floor-stack'
import { levelContents, levelsOf } from '../../../../shared/spatial-canvas/levels'
import type { CanvasNode, CanvasNoteColor } from '../../../../shared/spatial-canvas/types'
import { isFileTreeNode, isPortalNode } from './agent-canvas-node-kinds'
import { addCanvasPortal } from './agent-canvas-level-actions'
import { agentStatusForNode, cardAgentState } from './agent-canvas-card-status'
import {
  canvasSurfaceStyle,
  documentAppearance,
  ropeAvoidsNodes,
  selectionPaint
} from '../../../../shared/spatial-canvas/canvas-appearance'
import { AgentCanvasAppearanceDialog } from './AgentCanvasAppearanceDialog'
import { AgentCanvasLandingDialog } from './AgentCanvasLandingDialog'
import { parseNoteColor } from './agent-canvas-note-paper'
import { AgentCanvasNoteColorPicker } from './AgentCanvasNoteColorPicker'
import { liveSessionsFromTabs } from './agent-canvas-sessions'
import {
  disconnectCanvasEdge,
  getAgentCanvasState,
  removeCanvasNode,
  selectCanvasNode,
  setCanvasViewState,
  startCanvasHostSync,
  useAgentCanvas
} from './agent-canvas-store'
import { AgentCanvasBridgeMarkers } from './AgentCanvasBridgeMarkers'
import { AgentCanvasBridgeMenu } from './AgentCanvasBridgeMenu'
import { AgentCanvasDrawings, isDrawingNode } from './AgentCanvasDrawings'
import { AgentCanvasContextMenu, EMPTY_CONTEXT_TARGET } from './AgentCanvasContextMenu'
import { AgentCanvasFloorList } from './AgentCanvasFloorList'
import { AgentCanvasFloorHooksDialog } from './AgentCanvasFloorHooksDialog'
import { AgentCanvasNewFloorDialog } from './AgentCanvasNewFloorDialog'
import { AgentCanvasNewTerminalDialog } from './AgentCanvasNewTerminalDialog'
import { AgentCanvasFloorStack } from './AgentCanvasFloorStack'
import { AgentCanvasChrome } from './AgentCanvasChrome'
import { AgentCanvasCreationPreview } from './AgentCanvasCreationPreview'
import { useCanvasCreationGesture } from './use-canvas-creation-gesture'
import { attachCanvasFile } from './agent-canvas-attach'
import { AgentCanvasNodeCard } from './AgentCanvasNodeCard'
import { AgentCanvasPortalBody } from './AgentCanvasPortalBody'
import { AgentCanvasGroups } from './AgentCanvasGroups'
import { AgentCanvasFileTreeBody } from './AgentCanvasFileTreeBody'
import { setCanvasNodesBlurred } from './agent-canvas-node-actions'
import { AgentCanvasPromptDialog } from './AgentCanvasPromptDialog'
import { openCanvasPrompt } from './agent-canvas-prompt'
import { AgentCanvasRopes } from './AgentCanvasRopes'
import { useAgentCanvasDraw } from './use-agent-canvas-draw'
import { useCanvasViewControls } from './use-canvas-view-controls'
import { useAgentCanvasGestures } from './use-agent-canvas-gestures'
import { useAgentCanvasLivePanes } from './use-agent-canvas-live-panes'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'
import { useFloorOverviewKeys } from './use-floor-overview-keys'
import { useAgentCanvasKeys } from './use-agent-canvas-keys'
import { AgentCanvasSelectionBar } from './AgentCanvasSelectionBar'
import { AgentCanvasZoomControl } from './AgentCanvasZoomControl'
import { useCanvasConnectMode, useCanvasConnectingFrom } from './agent-canvas-connect-mode'
import { useStageHeight } from './use-stage-height'

/**
 * A card's editable body. Notes and text blocks share one body store, so this is
 * what makes the body follow whichever id the card carries.
 */
function bodyOfNode(node: CanvasNode, notes: Record<string, string>): string {
  if (node.content.kind === 'note') {
    return notes[node.content.noteId] ?? ''
  }
  return node.content.kind === 'text' ? (notes[node.content.textId] ?? '') : ''
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
  const loaded = useAgentCanvas((state) => state.loaded)
  const selectedNodeIds = useAgentCanvas((state) => state.selectedNodeIds)
  const [contextTarget, setContextTarget] = React.useState(EMPTY_CONTEXT_TARGET)
  const surfaceRef = React.useRef<HTMLDivElement | null>(null)
  const stageHeight = useStageHeight(surfaceRef)
  const prefersReducedMotion = usePrefersReducedMotion()
  useFloorOverviewKeys()
  useCanvasConnectMode(surfaceRef)
  const connectingFrom = useCanvasConnectingFrom()
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

  // The board's appearance: background, wire routing, selection mark.
  const appearance = documentAppearance(document)

  // Why each floor is its own plane; only the active one's cards and wires are drawn.
  const floor = levelContents(document, activeLevelId) ?? document.root
  const nodes = [...floor.nodes].sort((left, right) => left.zIndex - right.zIndex)
  // Why: bridge markers draw as pills on both floors (AgentCanvasBridgeMarkers), not as cards.
  const cards = nodes.filter((node) => !isDrawingNode(node) && node.content.kind !== 'bridge') // The reference's contextual toolbar shows for exactly one selected card.
  const selectedCard =
    selectedNodeIds.length === 1 ? cards.find((node) => node.id === selectedNodeIds[0]) : undefined

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

  // The live floor's name, shown at the top of the board like the reference.

  const surfaceCenterWorld = (): { x: number; y: number } => {
    const surface = surfaceRef.current
    const center = surface
      ? { x: surface.clientWidth / 2, y: surface.clientHeight / 2 }
      : { x: 0, y: 0 }
    return screenToWorld(center, getAgentCanvasState().viewport)
  }

  const { zoomBy, fitView } = useCanvasViewControls({ surfaceRef, cards, loaded })

  const addPortalAt = (at: { x: number; y: number }): void => {
    openCanvasPrompt({
      kind: 'text',
      title: translate('auto.components.agentCanvas.addPortal', 'Portal'),
      description: translate(
        'auto.components.agentCanvas.portalPrompt',
        'URL to pin on the canvas (e.g. localhost:3000)'
      ),
      label: translate('auto.components.agentCanvas.portalUrlLabel', 'Page URL'),
      placeholder: translate(
        'auto.components.agentCanvas.portalUrlPlaceholder',
        'http://localhost:3000'
      ),
      confirmLabel: translate('auto.components.agentCanvas.pin', 'Pin'),
      onSubmit: (raw) => {
        if (!addCanvasPortal(raw, at)) {
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

  const creationPreview = useCanvasCreationGesture(surfaceRef, (frame) =>
    addPortalAt({ x: frame.x, y: frame.y })
  )

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

  useAgentCanvasKeys(closeCanvasPage)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={surfaceRef}
        className={cn(
          'relative min-h-0 flex-1 touch-none overflow-hidden',
          drawTool && 'cursor-crosshair'
        )}
        style={
          appearance.background === 'transparent'
            ? undefined
            : { backgroundColor: 'var(--color-canvas-surface)' }
        }
        onPointerDown={(event) => {
          // Why: a press inside a portalled dialog or menu bubbles here through React,
          // though it never touched the board.
          if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
            return
          }
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
        <AgentCanvasContextMenu
          target={contextTarget}
          onTargetChange={setContextTarget}
          onAddPortal={addPortalAt}
        >
          <AgentCanvasFloorStack
            stack={floorStack}
            live={floorOverview}
            stageHeight={stageHeight}
            reduceMotion={prefersReducedMotion}
          >
            <div
              className={cn('absolute inset-0', floorOverview && 'pointer-events-none')}
              style={canvasSurfaceStyle(appearance, viewport, window.devicePixelRatio)}
            >
              <AgentCanvasDrawings
                nodes={nodes}
                viewport={viewport}
                draft={draw.draft?.shape ?? null}
                draftOrigin={draw.draft?.origin ?? null}
                selectedNodeId={selectedNodeId}
                selectedNodeIds={selectedNodeIds}
                onSelect={(target) => selectCanvasNode(target.id)}
              />
              <AgentCanvasRopes
                nodes={nodes}
                edges={floor.edges}
                viewport={viewport}
                pending={gestures.pendingWire}
                avoidNodes={ropeAvoidsNodes(appearance)}
                circuit={appearance.connectionStyle === 'circuit'}
                onDisconnect={(edge) => disconnectCanvasEdge(edge.id)}
              />
              <AgentCanvasGroups contents={floor} levelId={activeLevelId} viewport={viewport} />
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
                  selected={selectedNodeIds.includes(node.id)}
                  multiSelected={selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id)}
                  focused={selectedNodeIds.length === 1 && selectedNodeIds[0] === node.id}
                  connectTarget={connectingFrom !== null && connectingFrom !== node.id}
                  wiringSource={gestures.pendingWire?.fromNode.id === node.id}
                  live={node.content.kind === 'session' && liveById.has(node.content.sessionId)}
                  agentState={cardAgentState(agentStatusForNode(node, layouts, statusByPaneKey))}
                  noteBody={bodyOfNode(node, notes)}
                  selection={selectionPaint(appearance.selectionStyle)}
                  onHeaderPointerDown={gestures.onHeaderPointerDown}
                  onPortPointerDown={gestures.onPortPointerDown}
                  onSelect={(target) => selectCanvasNode(target.id)}
                  onOpen={openNode}
                  onRemove={(target) => removeCanvasNode(target.id)}
                  liveSlotRef={liveSlotFor(node)}
                  onReveal={(revealed) => setCanvasNodesBlurred([revealed.id], false)}
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
                    ) : isFileTreeNode(node) ? (
                      <AgentCanvasFileTreeBody
                        node={node}
                        interactive={node.id === selectedNodeId}
                      />
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
        </AgentCanvasContextMenu>
        {/* The selection rectangle lives above the cards so the marquee reads over
            them, and below the chrome so it never covers the toolbar. */}
        {gestures.marquee ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-20 rounded-sm border border-canvas-accent bg-canvas-accent-soft"
            style={{
              left: gestures.marquee.x,
              top: gestures.marquee.y,
              width: gestures.marquee.width,
              height: gestures.marquee.height
            }}
          />
        ) : null}
        <AgentCanvasCreationPreview frame={creationPreview} viewport={viewport} />
        {/* Outside the stack: the chrome must not tilt with the sheets, and it hides in the overview. */}
        {floorOverview ? null : (
          <AgentCanvasChrome
            selectedCard={selectedCard}
            cards={cards}
            onBack={closeCanvasPage}
            onAttach={(file) => void attachCanvasFile(file, surfaceCenterWorld())}
          />
        )}
        <AgentCanvasFloorList
          document={document}
          stageHeight={stageHeight}
          trailing={
            <AgentCanvasZoomControl zoom={viewport.zoom} onZoomBy={zoomBy} onFit={fitView} />
          }
        />
        {floorOverview ? null : <AgentCanvasSelectionBar />}
        <AgentCanvasPromptDialog />
        <AgentCanvasNewTerminalDialog />
        <AgentCanvasNewFloorDialog />
        <AgentCanvasFloorHooksDialog />
        <AgentCanvasAppearanceDialog />
        <AgentCanvasLandingDialog />
      </div>
    </div>
  )
}
