import { isTuiAgent } from '../../shared/tui-agent-config'
import type { TuiAgent } from '../../shared/tui-agent'
import type { AgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { sessionNode } from '../../shared/spatial-canvas/levels'
import { findLevelByName, placeRecruit } from '../../shared/spatial-canvas/recruit'
import { duplicateSessionLabel } from '../../shared/spatial-canvas/reachability'
import { mapAllLevels } from '../../shared/spatial-canvas/document'
import type { CanvasDocument, CanvasLevelId, CanvasNodeId } from '../../shared/spatial-canvas/types'
import { AgentCanvasAccessError } from './agent-canvas-peers'

export type RecruitedTerminal = { tabId: string; handle: string }

/** The slice of the runtime a recruit drives; kept narrow so tests can fake it. */
export type AgentCanvasRecruitRuntime = {
  createMobileSessionTerminal(
    worktree: string,
    options: {
      command?: string
      cwd?: string
      agent?: TuiAgent
      agentPrompt?: string
      activate?: boolean
      select?: boolean
    }
  ): Promise<{ tab: { terminal: string | null } }>
  listTerminals(): Promise<{
    terminals: { handle: string; tabId: string; connected: boolean; worktreeId?: string }[]
  }>
}

/** How long to wait for a freshly spawned PTY to appear in the terminal list. */
const SPAWN_POLL_MS = 250
const SPAWN_TIMEOUT_MS = 20_000

/**
 * Spawns an agent terminal and puts it on the canvas wired to the caller.
 *
 * The wire is what makes a recruit usable, so it is created in the same store
 * update as the card — a card that exists without a connection would be an
 * agent the team can see and never ask anything.
 */
export async function recruitAgent(input: {
  snapshot: AgentCanvasSnapshot
  runtime: AgentCanvasRecruitRuntime
  callerSessionId: string
  callerWorktreeId: string
  name: string
  agent?: string
  command?: string
  prompt?: string
  cwd?: string
  floor?: string
  /** Role assigned to the card; its briefing is already in `prompt`. */
  roleId?: string | null
  /** The caller's own agent: a recruit with no preset and no command is a copy of it. */
  callerAgent?: TuiAgent
  signal?: AbortSignal
}): Promise<{
  sessionId: string
  label: string
  handle: string
  levelId: CanvasLevelId
  bridged: boolean
  document: AgentCanvasSnapshot['document']
}> {
  const callerNode = sessionNode(input.snapshot.document, input.callerSessionId)
  if (!callerNode) {
    throw new AgentCanvasAccessError(
      'canvas_caller_not_on_canvas',
      'This terminal is not on the Agent Canvas yet; run another canvas command first.'
    )
  }
  let levelId: CanvasLevelId | undefined
  if (input.floor !== undefined) {
    const resolved = findLevelByName(input.snapshot.document, input.floor)
    if (resolved === undefined) {
      throw new AgentCanvasAccessError(
        'canvas_floor_not_found',
        `No floor is named "${input.floor}". Run \`orca canvas peers\` to see the floors.`
      )
    }
    levelId = resolved
  }
  if (input.agent !== undefined && !isTuiAgent(input.agent)) {
    throw new AgentCanvasAccessError(
      'canvas_recruit_failed',
      `"${input.agent}" is not a known agent preset.`
    )
  }
  if (!input.callerWorktreeId) {
    throw new AgentCanvasAccessError(
      'canvas_recruit_failed',
      'The calling terminal is not attached to a workspace, so there is nowhere to spawn a recruit.'
    )
  }
  // Why check before spawning: the label is how the team will address this agent, and a
  // duplicate would make every later `ask` ambiguous. Refusing here costs nothing; refusing
  // after the spawn would leave a running terminal nobody can reach.
  if (duplicateSessionLabel(input.snapshot.document, input.name)) {
    throw new AgentCanvasAccessError(
      'canvas_label_taken',
      `A session named "${input.name}" is already on the canvas. Pick another name, or ask the existing one.`
    )
  }
  const term = await spawnRecruitTerminal(
    input.runtime,
    input.callerWorktreeId,
    input,
    input.signal
  )
  const placed = placeRecruit(input.snapshot.document, {
    callerNodeId: callerNode.id,
    sessionId: term.tabId,
    label: input.name,
    ...(levelId === undefined ? {} : { levelId })
  })
  if ('refused' in placed) {
    throw new AgentCanvasAccessError(
      'canvas_recruit_failed',
      `The terminal started but could not be placed on the canvas (${placed.refused}). It is running as ${term.handle}.`
    )
  }
  return {
    sessionId: term.tabId,
    label: input.name,
    handle: term.handle,
    levelId: placed.levelId,
    bridged: placed.bridged,
    document: withRole(placed.document, placed.nodeId, input.roleId ?? null)
  }
}

/** Sets the role a card shows; a null role leaves the card as placed. */
export function withRole(
  document: CanvasDocument,
  nodeId: CanvasNodeId,
  roleId: string | null
): CanvasDocument {
  if (roleId === null) {
    return document
  }
  return mapAllLevels(document, (contents) => ({
    ...contents,
    nodes: contents.nodes.map((node) =>
      node.id === nodeId && node.content.kind === 'session'
        ? { ...node, content: { ...node.content, roleId } }
        : node
    )
  }))
}

export type RecruitLaunch = {
  agent?: string
  command?: string
  prompt?: string
  cwd?: string
  callerAgent?: TuiAgent
}

/**
 * Spawns a terminal in `worktreeId` and waits until it is up. Shared by recruit,
 * replace and cross-project recruits, which differ only in where the card goes.
 */
export async function spawnRecruitTerminal(
  runtime: AgentCanvasRecruitRuntime,
  worktreeId: string,
  launch: RecruitLaunch,
  signal?: AbortSignal
): Promise<RecruitedTerminal> {
  // Why the list before the spawn: without a handle, only a tab that did not exist yet is ours.
  const before = new Set((await runtime.listTerminals()).terminals.map((row) => row.tabId))
  const created = await spawnTerminal({ runtime, callerWorktreeId: worktreeId, ...launch })
  return waitForTerminal({ runtime, signal }, created.tab.terminal, before)
}

function spawnTerminal(
  input: RecruitLaunch & { runtime: AgentCanvasRecruitRuntime; callerWorktreeId: string }
): Promise<{ tab: { terminal: string | null } }> {
  // Why the caller's agent by default: the reference recruits "a copy of yourself"
  // when no preset is named; a bare shell could not take a prompt at all.
  const agent =
    input.agent !== undefined && isTuiAgent(input.agent)
      ? input.agent
      : input.command === undefined
        ? input.callerAgent
        : undefined
  return input.runtime
    .createMobileSessionTerminal(`id:${input.callerWorktreeId}`, {
      // Why not activate: recruiting from an agent must not steal the user's focus
      // mid-task. The card appearing on the canvas is the visible signal.
      activate: false,
      select: false,
      ...(input.command === undefined ? {} : { command: input.command }),
      ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      ...(agent === undefined ? {} : { agent }),
      ...(input.prompt === undefined ? {} : { agentPrompt: input.prompt })
    })
    .catch((error: unknown) => {
      throw new AgentCanvasAccessError(
        'canvas_recruit_failed',
        error instanceof Error ? error.message : 'The terminal could not be created.'
      )
    })
}

async function waitForTerminal(
  input: { runtime: AgentCanvasRecruitRuntime; signal?: AbortSignal },
  handle: string | null,
  existingTabIds: ReadonlySet<string>
): Promise<RecruitedTerminal> {
  const deadline = Date.now() + SPAWN_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (input.signal?.aborted) {
      throw new AgentCanvasAccessError('canvas_recruit_failed', 'The recruit was cancelled.')
    }
    const { terminals } = await input.runtime.listTerminals()
    const match = terminals.find(
      (terminal) =>
        (handle === null ? !existingTabIds.has(terminal.tabId) : terminal.handle === handle) &&
        terminal.connected
    )
    if (match) {
      return { tabId: match.tabId, handle: match.handle }
    }
    await new Promise((resolve) => setTimeout(resolve, SPAWN_POLL_MS))
  }
  throw new AgentCanvasAccessError(
    'canvas_recruit_failed',
    'The new terminal did not come up in time; it may still be starting.'
  )
}
