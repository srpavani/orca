import React from 'react'
import { translate } from '@/i18n/i18n'
import { buildFloorStack, type FloorStackItem } from '../../../../shared/spatial-canvas/floor-stack'
import { levelsOf } from '../../../../shared/spatial-canvas/levels'
import type { CanvasDocument, CanvasLevelId } from '../../../../shared/spatial-canvas/types'
import { useFloorSnapshots, watchThemeForFloorSnapshots } from './agent-canvas-floor-snapshots'

/**
 * Every floor as a sheet of the overview stack, numbered from the live one,
 * each carrying the picture it had when it was last on screen. The stack needs
 * every floor, not just the live one: the sheets above and below are what the
 * overview exists to show.
 */
export function useCanvasFloorStack(
  document: CanvasDocument,
  activeLevelId: CanvasLevelId
): FloorStackItem[] {
  const snapshots = useFloorSnapshots()
  React.useEffect(watchThemeForFloorSnapshots, [])
  return React.useMemo(
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
      ).map((item) => ({ ...item, snapshot: snapshots.get(item.key) ?? null })),
    [document, activeLevelId, snapshots]
  )
}
