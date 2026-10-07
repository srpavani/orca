import { defineMethod } from '../core'
import {
  AgentCanvasLinkRemoveParams,
  AgentCanvasLinksParams,
  AgentCanvasRoleAssignParams,
  AgentCanvasRoleCreateParams,
  AgentCanvasRoleDeleteParams,
  AgentCanvasRoleEditParams,
  AgentCanvasRoleListParams,
  AgentCanvasRoleShowParams
} from '../../../../shared/rpc-contract/agent-canvas-params'
import { replaceAgent } from '../../../agent-canvas/agent-canvas-crew'
import {
  getAgentCanvasCrossLinks,
  getAgentCanvasRoles,
  teamReachSources
} from '../../../agent-canvas/agent-canvas-host'
import { AgentCanvasAccessError } from '../../../agent-canvas/agent-canvas-peers'
import type { AgentCanvasRole } from '../../../agent-canvas/agent-canvas-roles'
import { sessionNode } from '../../../../shared/spatial-canvas/levels'
import { callerOf } from './agent-canvas'
import { crewPeerOf, launchOf } from './agent-canvas-crew'

function viewRole(role: AgentCanvasRole, projectKey: string | null) {
  return {
    id: role.id,
    name: role.name,
    prompt: role.prompt,
    scope: role.projectKey === null ? ('global' as const) : ('current' as const),
    // Why: a role scoped to another project is listed nowhere but there.
    current: role.projectKey === null || role.projectKey === projectKey
  }
}

/** Role presets and the project links the board draws, as in the reference's role verbs. */
export const AGENT_CANVAS_ROLE_METHODS = [
  defineMethod({
    name: 'canvas.roleList',
    params: AgentCanvasRoleListParams,
    handler: async (params, { runtime }) => {
      const { projectKey } = await callerOf(runtime, params)
      return {
        roles: getAgentCanvasRoles()
          .list(projectKey)
          .map((role) => viewRole(role, projectKey))
      }
    }
  }),
  defineMethod({
    name: 'canvas.roleShow',
    params: AgentCanvasRoleShowParams,
    handler: async (params, { runtime }) => {
      const { projectKey } = await callerOf(runtime, params)
      return { role: viewRole(getAgentCanvasRoles().find(params.name, projectKey), projectKey) }
    }
  }),
  defineMethod({
    name: 'canvas.roleCreate',
    params: AgentCanvasRoleCreateParams,
    handler: async (params, { runtime }) => {
      const { projectKey } = await callerOf(runtime, params)
      // Why current by default: most roles name one project's files and conventions.
      const scope = params.scope ?? (projectKey === null ? 'global' : 'current')
      const role = getAgentCanvasRoles().create(params.name, params.prompt, projectKey, scope)
      return { role: viewRole(role, projectKey) }
    }
  }),
  defineMethod({
    name: 'canvas.roleEdit',
    params: AgentCanvasRoleEditParams,
    handler: async (params, { runtime }) => {
      const { projectKey } = await callerOf(runtime, params)
      const role = getAgentCanvasRoles().update(params.name, projectKey, {
        ...(params.prompt === undefined ? {} : { prompt: params.prompt }),
        ...(params.oldText === undefined ? {} : { oldText: params.oldText }),
        ...(params.newText === undefined ? {} : { newText: params.newText }),
        ...(params.scope === undefined ? {} : { scope: params.scope })
      })
      return { role: viewRole(role, projectKey) }
    }
  }),
  defineMethod({
    name: 'canvas.roleDelete',
    params: AgentCanvasRoleDeleteParams,
    handler: async (params, { runtime }) => {
      const { projectKey } = await callerOf(runtime, params)
      return { deleted: getAgentCanvasRoles().remove(params.name, projectKey).name }
    }
  }),
  defineMethod({
    name: 'canvas.roleAssign',
    params: AgentCanvasRoleAssignParams,
    handler: async (params, { runtime, signal }) => {
      const caller = await callerOf(runtime, params)
      const role = params.role ? getAgentCanvasRoles().find(params.role, caller.projectKey) : null
      const { peer, store, linkedProjectKey } = crewPeerOf(runtime, caller, params.to)
      const { terminals } = await runtime.listTerminals()
      const agent = terminals.find((row) => row.tabId === peer.sessionId)?.agentIdentity
      if (agent === undefined) {
        throw new AgentCanvasAccessError(
          'canvas_recruit_failed',
          `Orca cannot tell which agent "${peer.label}" runs, so it cannot restart it into the role. Use \`recruit --replace\` with --agent.`
        )
      }
      // Why a restart: a role is the agent's starting context, as in the reference.
      const before = store.get().document
      const swapped = await replaceAgent({
        document: before,
        runtime,
        sessionId: peer.sessionId,
        launch: launchOf({ agent }, role, undefined),
        roleId: role?.id ?? null,
        ...(signal ? { signal } : {})
      })
      const saved = store.applyDelta(before, swapped.document)
      const projectKey = linkedProjectKey ?? caller.projectKey
      if (projectKey !== null) {
        getAgentCanvasCrossLinks().renameSession(
          { projectKey, sessionId: peer.sessionId },
          swapped.sessionId
        )
      }
      return { session: peer.label, role: role?.name ?? null, revision: saved.revision }
    }
  }),
  defineMethod({
    name: 'canvas.links',
    params: AgentCanvasLinksParams,
    handler: (params, { runtime }) => {
      const sources = teamReachSources(runtime)
      return {
        links: getAgentCanvasCrossLinks()
          .touching(params.projectKey)
          .flatMap((link) => {
            const [here, there] =
              link.a.projectKey === params.projectKey ? [link.a, link.b] : [link.b, link.a]
            const far = sessionNode(sources.boardOf(there.projectKey).document, there.sessionId)
            return far?.content.kind === 'session'
              ? [
                  {
                    linkId: link.id,
                    sessionId: here.sessionId,
                    peer: far.content.label,
                    project: sources.projectName(there.projectKey)
                  }
                ]
              : []
          })
      }
    }
  }),
  defineMethod({
    name: 'canvas.linkRemove',
    params: AgentCanvasLinkRemoveParams,
    handler: (params) => ({ removed: getAgentCanvasCrossLinks().remove(params.linkId) })
  })
]
