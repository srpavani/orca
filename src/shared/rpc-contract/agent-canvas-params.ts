import { z } from 'zod'
import { AGENT_CANVAS_NOTE_MAX_CHARS } from '../spatial-canvas/agent-canvas-snapshot'

const Id = z.string().min(1).max(512)
const Text = z.string().min(1).max(4_000)

/** Who is calling: the terminal handle wins; the tab id is the fallback for older shells. */
const Caller = {
  callerTerminal: Id.optional(),
  callerTabId: Id.optional()
}

export const AgentCanvasGetParams = z.object({
  /** When set and equal to the stored revision, the host answers `{ unchanged: true }`. */
  sinceRevision: z.number().int().min(0).optional()
})

// Why: the document shape is validated structurally on the host by parseAgentCanvasSnapshot,
// so the wire schema only bounds size instead of duplicating the whole union.
export const AgentCanvasSaveParams = z.object({
  baseRevision: z.number().int().min(0),
  document: z.unknown(),
  viewport: z.unknown(),
  notes: z.record(z.string(), z.string().max(AGENT_CANVAS_NOTE_MAX_CHARS))
})

export const AgentCanvasPeersParams = z.object({ ...Caller })

export const AgentCanvasAskParams = z.object({
  ...Caller,
  to: Text,
  prompt: z.string().min(1).max(100_000),
  timeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(60 * 60 * 1000)
    .optional()
})

export const AgentCanvasNoteReadParams = z.object({ ...Caller, note: Text })

export const AgentCanvasNoteWriteParams = z.object({
  ...Caller,
  note: Text,
  body: z.string().max(AGENT_CANVAS_NOTE_MAX_CHARS),
  mode: z.enum(['replace', 'append'])
})
