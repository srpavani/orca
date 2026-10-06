import React from 'react'
import { worldRectToScreen } from '../../../../shared/spatial-canvas/geometry'
import type { CanvasRect, CanvasViewport } from '../../../../shared/spatial-canvas/types'

/** The reference's CreationPreview: a dashed accent box where the armed tool will put its card. */
export function AgentCanvasCreationPreview(props: {
  frame: CanvasRect | null
  viewport: CanvasViewport
}): React.JSX.Element | null {
  if (!props.frame) {
    return null
  }
  const screen = worldRectToScreen(props.frame, props.viewport)
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-20 rounded"
      style={{
        left: screen.x,
        top: screen.y,
        width: screen.width,
        height: screen.height,
        border: '1.5px dashed var(--canvas-accent)',
        backgroundColor: 'color-mix(in srgb, var(--canvas-accent) 5%, transparent)',
        opacity: 0.6
      }}
    />
  )
}
