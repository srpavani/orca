import React from 'react'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import { useAgentCanvas } from './agent-canvas-store'
import { AgentCanvasBackButton } from './AgentCanvasBackButton'
import { AgentCanvasLevelBar } from './AgentCanvasLevelBar'
import { AgentCanvasMainToolbar } from './AgentCanvasMainToolbar'
import { AgentCanvasNodeToolbar } from './AgentCanvasNodeToolbar'
import { AgentCanvasTopChrome } from './AgentCanvasTopChrome'

/**
 * The reference's CanvasChrome: the corner button, the main toolbar, and under
 * it the contextual one — the draw tools while Draw is armed, otherwise the
 * selected card's toolbar.
 */
export function AgentCanvasChrome(props: {
  selectedCard: CanvasNode | undefined
  cards: readonly CanvasNode[]
  onBack: () => void
  onAttach: (file: File) => void
}): React.JSX.Element {
  const drawTool = useAgentCanvas((state) => state.drawTool)
  const { selectedCard } = props
  return (
    <>
      <AgentCanvasBackButton onBack={props.onBack} />
      <AgentCanvasTopChrome
        main={<AgentCanvasMainToolbar onAttach={props.onAttach} />}
        contextKey={drawTool ? 'draw' : (selectedCard?.id ?? null)}
        contextual={
          drawTool ? (
            <AgentCanvasLevelBar />
          ) : selectedCard ? (
            <AgentCanvasNodeToolbar node={selectedCard} nodes={props.cards} />
          ) : null
        }
      />
    </>
  )
}
