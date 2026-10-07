import type { AgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'
import { rebaseDocument } from '../../../../shared/spatial-canvas/document-rebase'
import type { CanvasDocument, CanvasViewport } from '../../../../shared/spatial-canvas/types'

export type CanvasLocalState = {
  document: CanvasDocument
  viewport: CanvasViewport
  notes: Record<string, string>
}

export type CanvasHostTransport = {
  get(sinceRevision?: number): Promise<
    (
      | { unchanged: true; revision: number }
      | { unchanged: false; snapshot: AgentCanvasSnapshot }
    ) & {
      /** Wires carrying a message right now (the reference's active transfers). */
      activeEdges?: string[]
    }
  >
  save(
    input: CanvasLocalState & { baseRevision: number }
  ): Promise<
    | { accepted: true; snapshot: AgentCanvasSnapshot }
    | { accepted: false; reason: 'stale' | 'invalid'; snapshot: AgentCanvasSnapshot }
  >
}

/** What the renderer last reconciled with: the base of a three-way merge. */
export type CanvasHostBase = {
  revision: number
  notes: Record<string, string>
  document: CanvasDocument
}

/**
 * Merges what the host changed into a local edit that lost a revision race.
 * Cards and wires an agent added or removed are replayed onto the user's
 * document; a note the agent changed keeps its text unless the user edited it
 * too, and a note the agent created is added.
 */
export function rebaseLocalEdit(
  local: CanvasLocalState,
  base: Omit<CanvasHostBase, 'revision'>,
  host: AgentCanvasSnapshot
): CanvasLocalState {
  const notes = { ...local.notes }
  for (const [noteId, hostBody] of Object.entries(host.notes)) {
    const userEdited = local.notes[noteId] !== base.notes[noteId]
    if (!userEdited || !(noteId in base.notes)) {
      notes[noteId] = hostBody
    }
  }
  return { ...local, notes, document: rebaseDocument(local.document, base.document, host.document) }
}

/**
 * Pushes local edits to the host with optimistic concurrency. Two retries cover
 * the common race (an agent wrote a note mid-drag); past that the host copy wins
 * so the renderer never loops against a writer it cannot out-pace.
 */
export async function pushToHost(
  transport: CanvasHostTransport,
  local: CanvasLocalState,
  base: CanvasHostBase
): Promise<AgentCanvasSnapshot> {
  let attempt = local
  let baseRevision = base.revision
  let baseNotes = base.notes
  let baseDocument = base.document
  for (let tries = 0; tries < 3; tries += 1) {
    const result = await transport.save({ ...attempt, baseRevision })
    if (result.accepted || result.reason === 'invalid') {
      return result.snapshot
    }
    attempt = rebaseLocalEdit(
      attempt,
      { notes: baseNotes, document: baseDocument },
      result.snapshot
    )
    baseRevision = result.snapshot.revision
    baseNotes = result.snapshot.notes
    baseDocument = result.snapshot.document
  }
  const latest = await transport.get()
  if (latest.unchanged) {
    throw new Error('canvas host answered unchanged without a revision to compare')
  }
  return latest.snapshot
}
