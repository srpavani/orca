import type { CanvasPoint } from '../../../../shared/spatial-canvas/types'
import { addCanvasNote, writeCanvasNote, getAgentCanvasState } from './agent-canvas-store'

/** The reference's NOTE_EXTENSIONS: text the board can show as a note. */
const NOTE_EXTENSIONS = new Set(['md', 'markdown', 'txt'])
/** Bigger files would freeze the note editor; the reference has no cap, Orca's textarea does. */
const MAX_NOTE_BYTES = 512 * 1024

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * The reference's createNodesFromFiles, for what Orca can carry: a text file
 * (md/markdown/txt) becomes a note with its contents — the reference's own
 * fallback when it has no path, `item.file.text()`. Any other file becomes a
 * note naming it, since Orca has no attachment card or attachment store.
 */
export async function attachCanvasFile(file: File, at: CanvasPoint): Promise<void> {
  const ext = extensionOf(file.name)
  const nodeId = addCanvasNote(at)
  const node = getAgentCanvasState()
    .document.levels.flatMap((level) => level.nodes)
    .concat(getAgentCanvasState().document.root.nodes)
    .find((candidate) => candidate.id === nodeId)
  if (node?.content.kind !== 'note') {
    return
  }
  const body =
    NOTE_EXTENSIONS.has(ext) && file.size <= MAX_NOTE_BYTES
      ? await file.text()
      : `${file.name}\n\n(${Math.max(1, Math.round(file.size / 1024))} KB)`
  writeCanvasNote(node.content.noteId, body)
}
