import { defineMethod } from '../core'
import {
  AgentCanvasLandingLandParams,
  AgentCanvasLandingPreflightParams,
  AgentCanvasLandingPreviewParams,
  AgentCanvasLandingResolveParams,
  AgentCanvasRepoHasCommitsParams
} from '../../../../shared/rpc-contract/agent-canvas-params'
import {
  landFloor,
  landingPreflight,
  landingPreview,
  type GitRun
} from '../../../agent-canvas/floor-landing'
import { extractExecError } from '../../../git/exec-error'
import { gitExecFileAsync } from '../../../git/runner'

/** The two runtime calls a delivery needs; the same ones `canvas.ask` drives. */
type ResolveRuntime = {
  listTerminals(): Promise<{ terminals: { handle: string; tabId: string; connected: boolean }[] }>
  sendTerminalAgentPrompt(
    handle: string,
    prompt: string,
    options: { inputKind: 'driving'; acceptQueued: true; observationTimeoutMs: number }
  ): Promise<unknown>
}

/**
 * Hands the conflict to an agent and returns at once, like the reference's
 * `prompter.deliver`: the agent resolves in its own time, in its own terminal.
 */
export async function deliverResolvePrompt(
  runtime: ResolveRuntime,
  sessionId: string,
  prompt: string
): Promise<{ delivered: true; handle: string }> {
  const { terminals } = await runtime.listTerminals()
  const terminal = terminals.find((entry) => entry.tabId === sessionId && entry.connected)
  if (!terminal) {
    throw new Error('That agent is on the canvas but its terminal is not running.')
  }
  await runtime.sendTerminalAgentPrompt(terminal.handle, prompt, {
    inputKind: 'driving',
    acceptQueued: true,
    observationTimeoutMs: 0
  })
  return { delivered: true, handle: terminal.handle }
}

/**
 * Landing reads git's exit codes (a conflict is an answer, not an error), so this
 * wraps the throwing runner into one that reports the code instead.
 */
const runGit: GitRun = async (args, cwd) => {
  try {
    const { stdout, stderr } = await gitExecFileAsync(args, { cwd })
    return { exitCode: 0, stdout, stderr }
  } catch (error) {
    const { stdout, stderr } = extractExecError(error)
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
    return { exitCode: typeof code === 'number' && code !== 0 ? code : 1, stdout, stderr }
  }
}

export const AGENT_CANVAS_LANDING_METHODS = [
  defineMethod({
    name: 'canvas.landingPreflight',
    params: AgentCanvasLandingPreflightParams,
    handler: async (params) => landingPreflight(runGit, params.worktreePath)
  }),
  defineMethod({
    name: 'canvas.landingPreview',
    params: AgentCanvasLandingPreviewParams,
    handler: async (params) => landingPreview(runGit, params.worktreePath, params.target)
  }),
  defineMethod({
    name: 'canvas.landFloor',
    params: AgentCanvasLandingLandParams,
    handler: async (params) => landFloor(runGit, params.worktreePath, params.target)
  }),
  defineMethod({
    // The reference refuses a floor on a repository with no commits
    // (repositoryHasNoCommits): there is nothing to branch a worktree from.
    name: 'canvas.repoHasCommits',
    params: AgentCanvasRepoHasCommitsParams,
    handler: async (params) =>
      (await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], params.repoPath)).exitCode === 0
  }),
  defineMethod({
    name: 'canvas.landingResolve',
    params: AgentCanvasLandingResolveParams,
    handler: async (params, { runtime }) =>
      deliverResolvePrompt(runtime, params.sessionId, params.prompt)
  })
]
