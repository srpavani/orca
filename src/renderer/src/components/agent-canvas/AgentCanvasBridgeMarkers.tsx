import React from 'react'
import { Cable, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { bridgesTouchingLevel } from '../../../../shared/spatial-canvas/bridges'
import { worldRectToScreen } from '../../../../shared/spatial-canvas/geometry'
import { levelsOf } from '../../../../shared/spatial-canvas/levels'
import type {
  CanvasDocument,
  CanvasLevelId,
  CanvasViewport
} from '../../../../shared/spatial-canvas/types'
import { switchCanvasLevel } from './agent-canvas-level-actions'
import { removeCanvasNode } from './agent-canvas-store'

/**
 * Draws every bridge touching the visible floor as a pill beside the near
 * session, naming the session and floor on the far side. Clicking it jumps to
 * that floor; the X cuts the bridge, revoking the cross-floor access.
 */
export function AgentCanvasBridgeMarkers(props: {
  document: CanvasDocument
  levelId: CanvasLevelId
  viewport: CanvasViewport
}): React.JSX.Element {
  const { document, levelId, viewport } = props
  const floorNames = new Map(levelsOf(document).map((level) => [level.id, level.name]))
  return (
    <>
      {bridgesTouchingLevel(document, levelId).map(({ bridge, near, far, farLevelId }) => {
        if (!near || !far || far.content.kind !== 'session') {
          return null
        }
        const anchor = worldRectToScreen(near.frame, viewport)
        const farFloor =
          farLevelId === null
            ? translate('auto.components.agentCanvas.groundFloor', 'Ground')
            : (floorNames.get(farLevelId) ?? '?')
        return (
          <div
            key={bridge.id}
            className={cn(
              'absolute flex -translate-y-full items-center gap-1 rounded-full border border-primary/60',
              'bg-background px-2 py-0.5 text-xs text-foreground shadow-sm'
            )}
            style={{ left: anchor.x + 8, top: anchor.y - 6 }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Cable className="size-3 text-primary" />
            <button
              type="button"
              className="max-w-48 truncate hover:underline"
              title={translate('auto.components.agentCanvas.bridgeJump', 'Go to the other floor')}
              onClick={() => switchCanvasLevel(farLevelId)}
            >
              {far.content.label} · {farFloor}
            </button>
            <button
              type="button"
              className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
              aria-label={translate(
                'auto.components.agentCanvas.bridgeCut',
                'Cut bridge (revokes access)'
              )}
              onClick={() => removeCanvasNode(bridge.bridgeNodeId)}
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
    </>
  )
}
