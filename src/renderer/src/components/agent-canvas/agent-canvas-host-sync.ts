import type { AgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'
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

/**
 * Merges agent-written note bodies into a local edit that lost a revision race:
 * the user's layout and wires win, and any note the agent changed keeps the
 * agent's text unless the user also edited that same note locally.
 */
export function rebaseLocalEdit(
  local: CanvasLocalState,
  base: Record<string, string>,
  host: AgentCanvasSnapshot
): CanvasLocalState {
  const notes = { ...local.notes }
  for (const [noteId, hostBody] of Object.entries(host.notes)) {
    const userEdited = local.notes[noteId] !== base[noteId]
    if (!userEdited && noteId in notes) {
      notes[noteId] = hostBody
    }
  }
  return { ...local, notes }
}

/**
 * Pushes local edits to the host with optimistic concurrency. Two retries cover
 * the common race (an agent wrote a note mid-drag); past that the host copy wins
 * so the renderer never loops against a writer it cannot out-pace.
 */
export async function pushToHost(
  transport: CanvasHostTransport,
  local: CanvasLocalState,
  base: { revision: number; notes: Record<string, string> }
): Promise<AgentCanvasSnapshot> {
  let attempt = local
  let baseRevision = base.revision
  let baseNotes = base.notes
  for (let tries = 0; tries < 3; tries += 1) {
    const result = await transport.save({ ...attempt, baseRevision })
    if (result.accepted || result.reason === 'invalid') {
      return result.snapshot
    }
    attempt = rebaseLocalEdit(attempt, baseNotes, result.snapshot)
    baseRevision = result.snapshot.revision
    baseNotes = result.snapshot.notes
  }
  const latest = await transport.get()
  if (latest.unchanged) {
    throw new Error('canvas host answered unchanged without a revision to compare')
  }
  return latest.snapshot
}
