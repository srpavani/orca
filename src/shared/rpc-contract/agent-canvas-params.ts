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

const PeerName = z.string().min(1).max(200)

/** Read a peer's current screenful without sending it anything. */
export const AgentCanvasCheckParams = z.object({
  ...Caller,
  to: PeerName,
  /** How many scrollback lines to return; the host trims to the last screen by default. */
  lines: z.number().int().min(1).max(2_000).optional()
})

export const AgentCanvasRecruitParams = z.object({
  ...Caller,
  /** Canvas name for the new terminal; it is how the team will address it. */
  name: PeerName,
  /** Agent preset to launch, e.g. 'claude'. Omitted runs the user's default shell. */
  agent: z.string().min(1).max(64).optional(),
  /** Shell command to run instead of an agent. */
  command: z.string().min(1).max(4_000).optional(),
  /** First prompt handed to the launched agent. */
  prompt: z.string().min(1).max(100_000).optional(),
  /** Working directory; defaults to the session's worktree. */
  cwd: z.string().min(1).max(4_096).optional(),
  /** Floor name to place the recruit on; defaults to the caller's floor. */
  floor: PeerName.optional()
})

export const AgentCanvasNotifyParams = z.object({
  message: z.string().min(1).max(1_000),
  title: z.string().min(1).max(200).optional()
})

/** Sonar: watch or mute a session's activity. Omitted `to` means the caller itself. */
export const AgentCanvasWatchParams = z.object({
  ...Caller,
  to: PeerName.optional(),
  watched: z.boolean()
})

export const AgentCanvasStatusParams = z.object({ ...Caller })

export const AgentCanvasFloorCreateParams = z.object({
  ...Caller,
  name: PeerName,
  /** Branch to pin the floor to; sessions on that branch land on it automatically. */
  branch: z.string().min(1).max(200).optional()
})
