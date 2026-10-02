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

export function addCanvasLevel(name: string, branch: string | null = null): void {
  let created: string | null = null
  updateDocument((document) => {
    const result = createLevel(document, { name, branch })
    created = result.levelId
    return result.document
  })
  if (created !== null) {
    setCanvasViewState({ activeLevelId: created, selectedNodeId: null })
  }
}

export function renameCanvasLevel(levelId: string, name: string): void {
  updateDocument((document) => renameLevel(document, levelId, name))
}

export function deleteCanvasLevel(levelId: string): void {
  updateDocument((document) => deleteLevel(document, levelId))
  if (getAgentCanvasState().activeLevelId === levelId) {
    setCanvasViewState({ activeLevelId: null, selectedNodeId: null })
  }
}

export function switchCanvasLevel(levelId: string | null): void {
  setCanvasViewState({ activeLevelId: levelId, selectedNodeId: null })
}

/** Sends the node to another floor; its wires are dropped (edges never cross floors). */
export function sendCanvasNodeToLevel(nodeId: CanvasNodeId, levelId: string | null): void {
  updateDocument((document) => moveNodeToLevel(document, nodeId, levelId))
  setCanvasViewState({ selectedNodeId: null })
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
