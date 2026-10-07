import { z } from 'zod'
import { AGENT_CANVAS_NOTE_MAX_CHARS } from '../spatial-canvas/agent-canvas-snapshot'

const Id = z.string().min(1).max(512)
const Text = z.string().min(1).max(4_000)

/** Who is calling: the terminal handle wins; the tab id is the fallback for older shells. */
const Caller = {
  callerTerminal: Id.optional(),
  callerTabId: Id.optional()
}

/** The repository whose board the renderer shows; omitted is the legacy global board. */
const ProjectKey = z.string().min(1).max(512).optional()

export const AgentCanvasGetParams = z.object({
  /** When set and equal to the stored revision, the host answers `{ unchanged: true }`. */
  sinceRevision: z.number().int().min(0).optional(),
  projectKey: ProjectKey
})

// Why: the document shape is validated structurally on the host by parseAgentCanvasSnapshot,
// so the wire schema only bounds size instead of duplicating the whole union.
export const AgentCanvasSaveParams = z.object({
  baseRevision: z.number().int().min(0),
  document: z.unknown(),
  viewport: z.unknown(),
  notes: z.record(z.string(), z.string().max(AGENT_CANVAS_NOTE_MAX_CHARS)),
  projectKey: ProjectKey
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

export const AgentCanvasNoteCreateParams = z.object({
  ...Caller,
  body: z.string().max(AGENT_CANVAS_NOTE_MAX_CHARS),
  name: z.string().min(1).max(200).optional()
})

export const AgentCanvasNoteEditParams = z.object({
  ...Caller,
  note: Text,
  oldText: z.string().min(1).max(AGENT_CANVAS_NOTE_MAX_CHARS),
  newText: z.string().max(AGENT_CANVAS_NOTE_MAX_CHARS)
})

/** Read a peer's current screenful without sending it anything. */
/** Raw keystrokes for a peer's TUI, e.g. picking an option in an approval menu. */
export const AgentCanvasInputParams = z.object({
  ...Caller,
  to: PeerName,
  text: z.string().min(1).max(4_000)
})

export const AgentCanvasConnectParams = z.object({
  ...Caller,
  from: PeerName,
  to: PeerName
})

export const AgentCanvasCheckParams = z.object({
  ...Caller,
  to: PeerName,
  /** How many scrollback lines to return; the host trims to the last screen by default. */
  lines: z.number().int().min(1).max(2_000).optional()
})

export const AgentCanvasRecruitParams = z.object({
  ...Caller,
  /** Canvas name for the new terminal; required unless `replace` keeps the current one. */
  name: PeerName.optional(),
  /** Agent preset to launch, e.g. 'claude'. Omitted runs the user's default shell. */
  agent: z.string().min(1).max(64).optional(),
  /** Shell command to run instead of an agent. */
  command: z.string().min(1).max(4_000).optional(),
  /** First prompt handed to the launched agent. */
  prompt: z.string().min(1).max(100_000).optional(),
  /** Working directory; defaults to the session's worktree. */
  cwd: z.string().min(1).max(4_096).optional(),
  /** Floor name to place the recruit on; defaults to the caller's floor. */
  floor: PeerName.optional(),
  /** Role preset whose prompt becomes the recruit's standing orders. */
  role: PeerName.optional(),
  /** Another project (repository display name) to recruit into, linked back to the caller. */
  project: PeerName.optional(),
  /** A teammate to swap in place: its card, wires and links survive, the process restarts. */
  replace: PeerName.optional()
})

export const AgentCanvasDismissParams = z.object({ ...Caller, to: PeerName })

export const AgentCanvasPresetListParams = z.object({ ...Caller })

export const AgentCanvasRoleListParams = z.object({ ...Caller })

export const AgentCanvasRoleShowParams = z.object({ ...Caller, name: PeerName })

const RolePrompt = z.string().min(1).max(20_000)
const RoleScope = z.enum(['current', 'global'])

export const AgentCanvasRoleCreateParams = z.object({
  ...Caller,
  name: PeerName,
  prompt: RolePrompt,
  scope: RoleScope.optional()
})

/** `prompt` replaces the whole prompt; `oldText`/`newText` replace a substring; `scope` moves it. */
export const AgentCanvasRoleEditParams = z.object({
  ...Caller,
  name: PeerName,
  prompt: RolePrompt.optional(),
  oldText: z.string().min(1).max(20_000).optional(),
  newText: z.string().max(20_000).optional(),
  scope: RoleScope.optional()
})

export const AgentCanvasRoleDeleteParams = z.object({ ...Caller, name: PeerName })

/** Omitting `role` clears it. Assigning restarts the agent so it boots into the role. */
export const AgentCanvasRoleAssignParams = z.object({
  ...Caller,
  to: PeerName,
  role: PeerName.optional()
})

/** The renderer's view of project links touching the board it shows. */
export const AgentCanvasLinksParams = z.object({ projectKey: z.string().min(1).max(512) })

export const AgentCanvasLinkRemoveParams = z.object({ linkId: z.string().min(1).max(512) })

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

const LandingPath = z.string().min(1).max(4_096)
const LandingBranch = z.string().min(1).max(512)

export const AgentCanvasLandingPreflightParams = z.object({ worktreePath: LandingPath })
export const AgentCanvasLandingPreviewParams = z.object({
  worktreePath: LandingPath,
  target: LandingBranch
})
export const AgentCanvasLandingLandParams = z.object({
  worktreePath: LandingPath,
  target: LandingBranch
})
export const AgentCanvasLandingResolveParams = z.object({
  sessionId: z.string().min(1).max(512),
  prompt: z.string().min(1).max(20_000)
})
export const AgentCanvasRepoHasCommitsParams = z.object({ repoPath: z.string().min(1) })
