import React from 'react'
import type {
  CanvasDocument,
  CanvasNode,
  CanvasViewport
} from '../../../../shared/spatial-canvas/types'
import { AgentCanvasFloorList } from './AgentCanvasFloorList'
import { AgentCanvasMinimap } from './AgentCanvasMinimap'
import { AgentCanvasMinimapButton, AgentCanvasZoomControl } from './AgentCanvasZoomControl'

/**
 * The reference's bottom-right corner (CanvasChrome): the floor indicator, the
 * minimap button and the zoom pill in one row, and the minimap panel above them
 * while it is open. The overview hides the minimap, as the stack replaces the map.
 */
export function AgentCanvasBottomChrome(props: {
  document: CanvasDocument
  cards: readonly CanvasNode[]
  viewport: CanvasViewport
  stage: { width: number; height: number }
  floorOverview: boolean
  onZoom: (zoom: number) => void
}): React.JSX.Element {
  const [minimapOpen, setMinimapOpen] = React.useState(false)
  const closeMinimap = React.useCallback(() => setMinimapOpen(false), [])
  return (
    <>
      <AgentCanvasFloorList
        document={props.document}
        stageHeight={props.stage.height}
        trailing={
          <>
            <AgentCanvasMinimapButton
              open={minimapOpen}
              onToggle={() => setMinimapOpen((open) => !open)}
            />
            <AgentCanvasZoomControl zoom={props.viewport.zoom} onZoom={props.onZoom} />
          </>
        }
      />
      {minimapOpen && !props.floorOverview ? (
        <AgentCanvasMinimap
          cards={props.cards}
          viewport={props.viewport}
          stage={props.stage}
          onClose={closeMinimap}
        />
      ) : null}
    </>
  )
}
