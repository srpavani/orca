import type { AgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import {
  addNode,
  connectNodes,
  createNoteNode,
  newCanvasId,
  type CanvasIdFactory
} from '../../shared/spatial-canvas/document'
import { levelIdOfNode, sessionNode } from '../../shared/spatial-canvas/levels'
import {
  AgentCanvasAccessError,
  resolveConnectedNote,
  writeConnectedNote
} from './agent-canvas-peers'

const NOTE_GAP = 40

/**
 * Creates a note wired to the caller, like the reference's `note create`: it
 * lands to the left of the caller's card on the caller's floor, so the user
 * sees whose note it is. Returns the snapshot and the new note's id.
 */
export function createConnectedNote(
  snapshot: AgentCanvasSnapshot,
  callerSessionId: string,
  input: { body: string; name?: string | null },
  now: string,
  id: CanvasIdFactory = newCanvasId
): { snapshot: AgentCanvasSnapshot; noteId: string } {
  const caller = sessionNode(snapshot.document, callerSessionId)
  if (caller === null) {
    throw new AgentCanvasAccessError(
      'canvas_caller_not_on_canvas',
      'This terminal has no card on the canvas yet.'
    )
  }
  const noteId = id()
  const draft = createNoteNode({
    noteId,
    at: { x: 0, y: caller.frame.y },
    pinnedName: input.name?.trim() || null,
    id
  })
  const note = {
    ...draft,
    frame: { ...draft.frame, x: caller.frame.x - draft.frame.width - NOTE_GAP }
  }
  const levelId = levelIdOfNode(snapshot.document, caller.id)
  const wired = connectNodes(addNode(snapshot.document, note, levelId), caller.id, note.id, now, id)
  if (wired === null) {
    throw new AgentCanvasAccessError('canvas_note_not_connected', 'The note could not be wired.')
  }
  return {
    snapshot: {
      ...snapshot,
      document: wired.document,
      notes: { ...snapshot.notes, [noteId]: input.body }
    },
    noteId
  }
}

/**
 * Replaces one exact occurrence of `oldText`, like the reference's `note edit`.
 * Why exactly one: an edit that matched twice would change text the agent never saw.
 */
export function editConnectedNote(
  snapshot: AgentCanvasSnapshot,
  callerSessionId: string,
  target: string,
  oldText: string,
  newText: string
): AgentCanvasSnapshot {
  const note = resolveConnectedNote(snapshot, callerSessionId, target)
  const body = snapshot.notes[note.noteId] ?? ''
  const at = body.indexOf(oldText)
  if (at === -1 || body.includes(oldText, at + oldText.length)) {
    throw new AgentCanvasAccessError(
      'canvas_note_edit_no_match',
      at === -1
        ? `The text to replace was not found in note "${note.displayName}". Read the note first.`
        : `The text to replace appears more than once in note "${note.displayName}"; include more context.`
    )
  }
  const next = body.slice(0, at) + newText + body.slice(at + oldText.length)
  return writeConnectedNote(snapshot, callerSessionId, note.noteId, next, 'replace')
}
