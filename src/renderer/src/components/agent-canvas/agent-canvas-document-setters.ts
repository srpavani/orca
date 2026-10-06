import type { CanvasAppearance } from '../../../../shared/spatial-canvas/canvas-appearance'
import type { WorkspaceHooks } from '../../../../shared/spatial-canvas/floor-hooks'
import {
  patchSessionFlags,
  setNoteColor as setNoteColorInDocument,
  type SessionFlagPatch
} from '../../../../shared/spatial-canvas/node-flags'
import type { CanvasNodeId, CanvasNoteColor } from '../../../../shared/spatial-canvas/types'
import { updateDocument } from './agent-canvas-store'

/** Document-level setters: each is one persisted edit through updateDocument. */

/** Replaces the workspace's floor hooks. Hooks are shared by every floor. */
export function setCanvasHooks(hooks: WorkspaceHooks): void {
  updateDocument((document) => ({ ...document, hooks }))
}

/** Replaces the board's appearance. */
export function setCanvasAppearance(appearance: CanvasAppearance): void {
  updateDocument((document) => ({ ...document, appearance }))
}

/** Flips a session card's Sonar watch or its lead flag. */
export function setCanvasSessionFlags(nodeId: CanvasNodeId, patch: SessionFlagPatch): void {
  updateDocument((document) => patchSessionFlags(document, nodeId, patch))
}

/** Recolours a sticky note. Paper colour is a property of the node, so it lives on the document. */
export function setCanvasNoteColor(nodeId: CanvasNodeId, color: CanvasNoteColor): void {
  updateDocument((document) => setNoteColorInDocument(document, nodeId, color))
}
