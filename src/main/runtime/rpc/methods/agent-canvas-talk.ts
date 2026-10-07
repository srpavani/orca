import { defineMethod } from '../core'
import {
  AgentCanvasAskParams,
  AgentCanvasCheckParams,
  AgentCanvasPeersParams
} from '../../../../shared/rpc-contract/agent-canvas-params'
import { askConnectedPeer, readConnectedPeer } from '../../../agent-canvas/agent-canvas-ask'
import { teamReachSources, type RepoLister } from '../../../agent-canvas/agent-canvas-host'
import { viewPeers } from '../../../agent-canvas/agent-canvas-peers'
import {
  linkedPeersOf,
  projectAddress,
  resolveTeamPeer
} from '../../../agent-canvas/agent-canvas-team-reach'
import { edgesBetweenSessions, withTransfer } from '../../../agent-canvas/agent-canvas-transfers'
import type { AgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'
import { callerOf } from './agent-canvas'

type Caller = Awaited<ReturnType<typeof callerOf>>

/** Resolves a teammate on the caller's board or across a project link. */
export function teamPeerOf(runtime: RepoLister, caller: Caller, target: string) {
  const sources = teamReachSources(runtime)
  const end = { projectKey: caller.projectKey ?? '', sessionId: caller.caller }
  const peer = resolveTeamPeer(caller.snapshot, end, target, sources)
  const self = viewPeers(caller.snapshot, caller.caller).self.label
  // Why: a linked peer answers back by address, so it must see the caller's own.
  const callerAddress =
    peer.linked && caller.projectKey !== null
      ? projectAddress(self, sources.projectName(caller.projectKey))
      : undefined
  return {
    peer: { sessionId: peer.sessionId, label: peer.label },
    callerAddress,
    linkedProjectKey: peer.linked?.projectKey ?? null
  }
}

/** The wires a message crosses; a project link has no wire to light on this board. */
function litEdges(snapshot: AgentCanvasSnapshot, caller: string, target: string): string[] {
  return edgesBetweenSessions(snapshot.document, caller, target)
}

/** The verbs agents talk with: list the team, ask a teammate, read its screen. */
export const AGENT_CANVAS_TALK_METHODS = [
  defineMethod({
    name: 'canvas.peers',
    params: AgentCanvasPeersParams,
    handler: async (params, { runtime }) => {
      const caller = await callerOf(runtime, params)
      const view = viewPeers(caller.snapshot, caller.caller)
      if (caller.projectKey === null) {
        return view
      }
      const linked = linkedPeersOf(
        { projectKey: caller.projectKey, sessionId: caller.caller },
        teamReachSources(runtime)
      )
      return {
        ...view,
        sessions: [
          ...view.sessions,
          ...linked.map((peer) => ({
            sessionId: peer.sessionId,
            nodeId: '',
            label: peer.address,
            roleId: null,
            isLead: peer.isLead
          }))
        ]
      }
    }
  }),
  defineMethod({
    name: 'canvas.ask',
    params: AgentCanvasAskParams,
    handler: async (params, { runtime, signal }) => {
      const caller = await callerOf(runtime, params)
      const { peer, callerAddress } = teamPeerOf(runtime, caller, params.to)
      return withTransfer(litEdges(caller.snapshot, caller.caller, peer.sessionId), () =>
        askConnectedPeer({
          snapshot: caller.snapshot,
          runtime,
          callerSessionId: caller.caller,
          target: params.to,
          prompt: params.prompt,
          peer,
          ...(callerAddress ? { callerAddress } : {}),
          ...(params.timeoutMs ? { timeoutMs: params.timeoutMs } : {}),
          ...(signal ? { signal } : {})
        })
      )
    }
  }),
  defineMethod({
    name: 'canvas.check',
    params: AgentCanvasCheckParams,
    handler: async (params, { runtime }) => {
      const caller = await callerOf(runtime, params)
      const { peer } = teamPeerOf(runtime, caller, params.to)
      return withTransfer(litEdges(caller.snapshot, caller.caller, peer.sessionId), () =>
        readConnectedPeer({
          snapshot: caller.snapshot,
          runtime,
          callerSessionId: caller.caller,
          target: params.to,
          peer,
          ...(params.lines === undefined ? {} : { lines: params.lines })
        })
      )
    }
  })
]
