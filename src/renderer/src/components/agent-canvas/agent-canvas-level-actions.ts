import { bridgeSessions } from '../../../../shared/spatial-canvas/bridges'
import {
  addDrawing,
  addPortal,
  createLevel,
  deleteLevel,
  moveNodeToLevel,
  normalizePortalUrl,
  renameLevel
} from '../../../../shared/spatial-canvas/level-edits'
import type {
  CanvasNodeId,
  CanvasPoint,
  CanvasShape
} from '../../../../shared/spatial-canvas/types'
import { getAgentCanvasState, setCanvasViewState, updateDocument } from './agent-canvas-store'
import { runFloorHooks } from './agent-canvas-hook-runner'

export function addCanvasLevel(name: string, branch: string | null = null): void {
  let created: string | null = null
  updateDocument((document) => {
    const result = createLevel(document, { name, branch })
    created = result.levelId
    return result.document
  })
  if (created !== null) {
    setCanvasViewState({ activeLevelId: created, selectedNodeId: null })
    // Fire and forget: a hook must never block the floor from appearing.
    void runFloorHooks('setup', created)
  }
}

export function renameCanvasLevel(levelId: string, name: string): void {
  updateDocument((document) => renameLevel(document, levelId, name))
}

export function deleteCanvasLevel(levelId: string): void {
  // Why before the delete: teardown needs the floor's branch and checkout, which
  // the document no longer has once the level is gone.
  void runFloorHooks('teardown', levelId)
  updateDocument((document) => deleteLevel(document, levelId))
  if (getAgentCanvasState().activeLevelId === levelId) {
    setCanvasViewState({ activeLevelId: null, selectedNodeId: null })
  }
}

export function switchCanvasLevel(levelId: string | null): void {
  setCanvasViewState({ activeLevelId: levelId, selectedNodeId: null })
  void runFloorHooks('run', levelId)
}

/** Sends the node to another floor; its wires are dropped (edges never cross floors). */
export function sendCanvasNodeToLevel(nodeId: CanvasNodeId, levelId: string | null): void {
  updateDocument((document) => moveNodeToLevel(document, nodeId, levelId))
  setCanvasViewState({ selectedNodeId: null })
}

/** Grants one-hop access between sessions on different floors. */
export function bridgeCanvasSessions(fromNodeId: CanvasNodeId, toNodeId: CanvasNodeId): void {
  updateDocument((document) => {
    const result = bridgeSessions(document, fromNodeId, toNodeId)
    return 'refused' in result ? document : result.document
  })
}

export function addCanvasDrawing(shape: CanvasShape, at: CanvasPoint): void {
  const levelId = getAgentCanvasState().activeLevelId
  updateDocument((document) => addDrawing(document, shape, at, levelId).document)
}

/** Returns false for URLs that are not plain http(s) pages. */
export function addCanvasPortal(rawUrl: string, at: CanvasPoint): boolean {
  const url = normalizePortalUrl(rawUrl)
  if (url === null) {
    return false
  }
  const levelId = getAgentCanvasState().activeLevelId
  updateDocument((document) => addPortal(document, url, at, levelId).document)
  return true
}
