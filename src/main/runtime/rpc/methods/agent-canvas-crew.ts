import { defineMethod } from '../core'
import {
  AgentCanvasDismissParams,
  AgentCanvasPresetListParams,
  AgentCanvasRecruitParams
} from '../../../../shared/rpc-contract/agent-canvas-params'
import { TUI_AGENT_CONFIG } from '../../../../shared/tui-agent-config'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { getRepoMainWorktreeId } from '../../../../shared/worktree/id'
import {
  dismissAgent,
  recruitIntoProject,
  replaceAgent,
  type AgentCanvasCrewRuntime
} from '../../../agent-canvas/agent-canvas-crew'
import {
  getAgentCanvasCrossLinks,
  getAgentCanvasRoles,
  getAgentCanvasStore
} from '../../../agent-canvas/agent-canvas-host'
import { AgentCanvasAccessError } from '../../../agent-canvas/agent-canvas-peers'
import { recruitAgent, type RecruitLaunch } from '../../../agent-canvas/agent-canvas-recruit'
import { roleBriefing, type AgentCanvasRole } from '../../../agent-canvas/agent-canvas-roles'
import { projectAddress } from '../../../agent-canvas/agent-canvas-team-reach'
import { callerOf } from './agent-canvas'
import { teamPeerOf } from './agent-canvas-talk'

type Caller = Awaited<ReturnType<typeof callerOf>>
type Repos = { listRepos(): readonly { id: string; path: string; displayName: string }[] }

/** The quick-start names the board shows; anything else is listed by its id. */
const PRESET_LABELS: ReadonlyMap<string, string> = new Map([
  ['claude', 'Claude Code'],
  ['codex', 'Codex'],
  ['antigravity', 'Antigravity'],
  ['opencode', 'OpenCode']
])

async function agentOf(runtime: AgentCanvasCrewRuntime, sessionId: string) {
  const { terminals } = await runtime.listTerminals()
  return terminals.find((row) => row.tabId === sessionId)?.agentIdentity
}

/** Where a teammate's card is: this board, or the far end of a project link. */
export function boardOfPeer(caller: Caller, linkedProjectKey: string | null) {
  return linkedProjectKey === null ? caller.store : getAgentCanvasStore(linkedProjectKey)
}

/** Resolves a teammate and the board its card lives on. */
export function crewPeerOf(runtime: Repos, caller: Caller, target: string) {
  const { peer, linkedProjectKey } = teamPeerOf(runtime, caller, target)
  return { peer, store: boardOfPeer(caller, linkedProjectKey), linkedProjectKey }
}

/** The launch a recruit or a restart uses: preset, command and the role's briefing. */
export function launchOf(
  params: { agent?: string; command?: string; prompt?: string; cwd?: string },
  role: AgentCanvasRole | null,
  callerAgent: TuiAgent | undefined
): RecruitLaunch {
  const prompt = role ? roleBriefing(role, params.prompt) : params.prompt
  return {
    ...(params.agent === undefined ? {} : { agent: params.agent }),
    ...(params.command === undefined ? {} : { command: params.command }),
    ...(prompt === undefined ? {} : { prompt }),
    ...(params.cwd === undefined ? {} : { cwd: params.cwd }),
    ...(callerAgent === undefined ? {} : { callerAgent })
  }
}

function findProject(runtime: Repos, name: string) {
  const norm = name.trim().toLowerCase()
  const repo = runtime.listRepos().find((candidate) => candidate.displayName.toLowerCase() === norm)
  if (!repo) {
    throw new AgentCanvasAccessError(
      'canvas_project_not_found',
      `No project is named "${name}". Open it in Orca first; its name is the one in the sidebar.`
    )
  }
  return repo
}

export const AGENT_CANVAS_CREW_METHODS = [
  defineMethod({
    name: 'canvas.recruit',
    params: AgentCanvasRecruitParams,
    handler: async (params, { runtime, signal }) => {
      const caller = await callerOf(runtime, params)
      const role = params.role ? getAgentCanvasRoles().find(params.role, caller.projectKey) : null
      const launch = launchOf(params, role, await agentOf(runtime, caller.caller))
      if (params.replace !== undefined) {
        const { peer, store, linkedProjectKey } = crewPeerOf(runtime, caller, params.replace)
        const swapped = await replaceAgent({
          document: store.get().document,
          runtime,
          sessionId: peer.sessionId,
          ...(params.name ? { name: params.name } : {}),
          launch,
          ...(role ? { roleId: role.id } : {}),
          ...(signal ? { signal } : {})
        })
        const saved = store.update((current) => ({ ...current, document: swapped.document }))
        if (linkedProjectKey !== null || caller.projectKey !== null) {
          getAgentCanvasCrossLinks().renameSession(
            { projectKey: linkedProjectKey ?? caller.projectKey ?? '', sessionId: peer.sessionId },
            swapped.sessionId
          )
        }
        return {
          session: { sessionId: swapped.sessionId, label: swapped.label, handle: swapped.handle },
          floor: null,
          bridged: false,
          replaced: peer.label,
          revision: saved.revision
        }
      }
      if (params.name === undefined) {
        throw new AgentCanvasAccessError(
          'canvas_recruit_failed',
          'A recruit needs a name; only --replace may keep the current one.'
        )
      }
      const name = params.name
      if (params.project !== undefined) {
        const repo = findProject(runtime, params.project)
        if (caller.projectKey === null || repo.id === caller.projectKey) {
          throw new AgentCanvasAccessError(
            'canvas_project_not_found',
            `"${params.project}" is this terminal's own project; recruit without --project.`
          )
        }
        const store = getAgentCanvasStore(repo.id)
        const placed = await recruitIntoProject({
          board: store.get(),
          runtime,
          worktreeId: getRepoMainWorktreeId(repo),
          name,
          launch,
          roleId: role?.id ?? null,
          ...(signal ? { signal } : {})
        })
        const saved = store.update((current) => ({ ...current, document: placed.document }))
        getAgentCanvasCrossLinks().add(
          { projectKey: caller.projectKey, sessionId: caller.caller },
          { projectKey: repo.id, sessionId: placed.sessionId },
          new Date().toISOString()
        )
        return {
          session: {
            sessionId: placed.sessionId,
            label: projectAddress(name, repo.displayName),
            handle: placed.handle
          },
          floor: null,
          bridged: false,
          project: repo.displayName,
          revision: saved.revision
        }
      }
      const result = await recruitAgent({
        snapshot: caller.snapshot,
        runtime,
        callerSessionId: caller.caller,
        callerWorktreeId: caller.session.worktreeId,
        name,
        ...launch,
        ...(params.floor === undefined ? {} : { floor: params.floor }),
        roleId: role?.id ?? null,
        ...(signal ? { signal } : {})
      })
      // Why one store update for the card and its wire: a card without the connection
      // would be an agent the team can see and never ask anything.
      const saved = caller.store.update((current) => ({ ...current, document: result.document }))
      return {
        session: { sessionId: result.sessionId, label: result.label, handle: result.handle },
        floor: result.levelId,
        bridged: result.bridged,
        revision: saved.revision
      }
    }
  }),
  defineMethod({
    name: 'canvas.dismiss',
    params: AgentCanvasDismissParams,
    handler: async (params, { runtime }) => {
      const caller = await callerOf(runtime, params)
      const { peer, store, linkedProjectKey } = crewPeerOf(runtime, caller, params.to)
      const document = await dismissAgent({
        document: store.get().document,
        runtime,
        sessionId: peer.sessionId
      })
      const saved = store.update((current) => ({ ...current, document }))
      const projectKey = linkedProjectKey ?? caller.projectKey
      if (projectKey !== null) {
        getAgentCanvasCrossLinks().forgetSession({ projectKey, sessionId: peer.sessionId })
      }
      return { dismissed: peer.label, revision: saved.revision }
    }
  }),
  defineMethod({
    name: 'canvas.presetList',
    params: AgentCanvasPresetListParams,
    handler: async (params, { runtime }) => {
      const caller = await callerOf(runtime, params)
      const own = await agentOf(runtime, caller.caller)
      return {
        presets: Object.keys(TUI_AGENT_CONFIG).map((id) => ({
          id,
          label: PRESET_LABELS.get(id) ?? id,
          isYours: id === own
        }))
      }
    }
  })
]
