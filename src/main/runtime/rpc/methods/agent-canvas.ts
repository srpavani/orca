import { defineMethod } from '../core'
import {
  AgentCanvasAskParams,
  AgentCanvasCheckParams,
  AgentCanvasFloorCreateParams,
  AgentCanvasGetParams,
  AgentCanvasNoteReadParams,
  AgentCanvasNoteWriteParams,
  AgentCanvasNotifyParams,
  AgentCanvasPeersParams,
  AgentCanvasRecruitParams,
  AgentCanvasSaveParams,
  AgentCanvasStatusParams,
  AgentCanvasWatchParams
} from '../../../../shared/rpc-contract/agent-canvas-params'
import {
  askConnectedPeer,
  readConnectedPeer,
  type AgentCanvasAskRuntime
} from '../../../agent-canvas/agent-canvas-ask'
import {
  recruitAgent,
  type AgentCanvasRecruitRuntime
} from '../../../agent-canvas/agent-canvas-recruit'
import { notifyUser } from '../../../agent-canvas/agent-canvas-notify'
import {
  ensureCallerPlaced,
  ensureSonarRunning,
  getAgentCanvasStore,
  resolveCaller,
  saveCanvasFromClient,
  type CanvasTerminalRow
} from '../../../agent-canvas/agent-canvas-host'
import type { SonarRuntime } from '../../../agent-canvas/agent-canvas-sonar'
import {
  AgentCanvasAccessError,
  resolveConnectedPeer,
  resolveConnectedNote,
  viewPeers,
  viewStatus,
  writeConnectedNote,
  type AgentCanvasTerminalSample
} from '../../../agent-canvas/agent-canvas-peers'
import { createLevel } from '../../../../shared/spatial-canvas/level-edits'
import { sessionNode } from '../../../../shared/spatial-canvas/levels'
import { findLevelByName } from '../../../../shared/spatial-canvas/recruit'
import { patchSessionFlags } from '../../../../shared/spatial-canvas/node-flags'
import type { AgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'
import {
  activeTransferEdgeIds,
  edgesBetweenSessions,
  withTransfer
} from '../../../agent-canvas/agent-canvas-transfers'

/** The wires a message from `caller` to `target` crosses; none when the target does not resolve. */
function transferEdges(snapshot: AgentCanvasSnapshot, caller: string, target: string): string[] {
  try {
    const peer = resolveConnectedPeer(snapshot, caller, target)
    return edgesBetweenSessions(snapshot.document, caller, peer.sessionId)
  } catch {
    return []
  }
}

type TerminalLister = {
  listTerminals(): Promise<{ terminals: CanvasTerminalRow[] }>
}

/**
 * Resolves the calling agent and makes sure its card exists, so the canvas
 * works for agents even if the user never opened the canvas view. The snapshot
 * returned already contains the caller.
 */
async function callerOf(
  runtime: TerminalLister,
  params: { callerTerminal?: string; callerTabId?: string }
): Promise<{ caller: string; snapshot: AgentCanvasSnapshot }> {
  const session = await resolveCaller(params, () => runtime.listTerminals())
  const store = getAgentCanvasStore()
  const snapshot = ensureCallerPlaced(store, session)
  // Why here: every agent-facing canvas command passes through, so the watch
  // starts the first time the canvas is actually used and never at boot.
  ensureSonarRunning(store, runtime as unknown as SonarRuntime)
  return { caller: session.sessionId, snapshot }
}

export const AGENT_CANVAS_METHODS = [
  defineMethod({
    name: 'canvas.get',
    params: AgentCanvasGetParams,
    // Why the watch also starts here: the user turns Sonar on from the canvas UI (not from a
    // terminal), so the renderer's own read/write must arm it too — otherwise a card could
    // show a watching eye while nothing was actually watching.
    handler: (params, { runtime }) => {
      ensureSonarRunning(getAgentCanvasStore(), runtime as unknown as SonarRuntime)
      const snapshot = getAgentCanvasStore().get()
      // Why on every answer: a lit wire is not a document change, so it must ride
      // the unchanged reply too or the canvas would only see it on the next edit.
      const activeEdges = activeTransferEdgeIds()
      if (params.sinceRevision !== undefined && params.sinceRevision === snapshot.revision) {
        return { unchanged: true as const, revision: snapshot.revision, activeEdges }
      }
      return { unchanged: false as const, snapshot, activeEdges }
    }
  }),
  defineMethod({
    name: 'canvas.save',
    params: AgentCanvasSaveParams,
    handler: (params, { runtime }) => {
      ensureSonarRunning(getAgentCanvasStore(), runtime as unknown as SonarRuntime)
      return saveCanvasFromClient(getAgentCanvasStore(), params)
    }
  }),
  defineMethod({
    name: 'canvas.peers',
    params: AgentCanvasPeersParams,
    handler: async (params, { runtime }) => {
      const { caller, snapshot } = await callerOf(runtime, params)
      return viewPeers(snapshot, caller)
    }
  }),
  defineMethod({
    name: 'canvas.ask',
    params: AgentCanvasAskParams,
    handler: async (params, { runtime, signal }) => {
      const { caller, snapshot } = await callerOf(runtime, params)
      return withTransfer(transferEdges(snapshot, caller, params.to), () =>
        askConnectedPeer({
          snapshot,
          runtime: runtime as unknown as AgentCanvasAskRuntime,
          callerSessionId: caller,
          target: params.to,
          prompt: params.prompt,
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
      const { caller, snapshot } = await callerOf(runtime, params)
      return withTransfer(transferEdges(snapshot, caller, params.to), () =>
        readConnectedPeer({
          snapshot,
          runtime: runtime as unknown as AgentCanvasAskRuntime,
          callerSessionId: caller,
          target: params.to,
          ...(params.lines === undefined ? {} : { lines: params.lines })
        })
      )
    }
  }),
  defineMethod({
    name: 'canvas.recruit',
    params: AgentCanvasRecruitParams,
    handler: async (params, { runtime, signal }) => {
      const session = await resolveCaller(params, () => runtime.listTerminals())
      const snapshot = ensureCallerPlaced(getAgentCanvasStore(), session)
      const result = await recruitAgent({
        snapshot,
        runtime: runtime as unknown as AgentCanvasRecruitRuntime,
        callerSessionId: session.sessionId,
        callerWorktreeId: session.worktreeId,
        name: params.name,
        ...(params.agent === undefined ? {} : { agent: params.agent }),
        ...(params.command === undefined ? {} : { command: params.command }),
        ...(params.prompt === undefined ? {} : { prompt: params.prompt }),
        ...(params.cwd === undefined ? {} : { cwd: params.cwd }),
        ...(params.floor === undefined ? {} : { floor: params.floor }),
        ...(signal ? { signal } : {})
      })
      // Why one store update for the card and its wire: a card without the connection
      // would be an agent the team can see and never ask anything.
      const saved = getAgentCanvasStore().update((current) => ({
        ...current,
        document: result.document
      }))
      return {
        session: { sessionId: result.sessionId, label: result.label, handle: result.handle },
        floor: result.levelId,
        bridged: result.bridged,
        revision: saved.revision
      }
    }
  }),
  defineMethod({
    name: 'canvas.notify',
    params: AgentCanvasNotifyParams,
    handler: (params) => notifyUser(params.message, params.title)
  }),
  defineMethod({
    name: 'canvas.status',
    params: AgentCanvasStatusParams,
    handler: async (params, { runtime }) => {
      const { caller, snapshot } = await callerOf(runtime, params)
      const lister = runtime as unknown as {
        listTerminals(): Promise<{ terminals: AgentCanvasTerminalSample[] }>
      }
      const { terminals } = await lister.listTerminals()
      return { sessions: viewStatus(snapshot, caller, terminals, Date.now()) }
    }
  }),
  defineMethod({
    name: 'canvas.watch',
    params: AgentCanvasWatchParams,
    handler: async (params, { runtime }) => {
      const { caller, snapshot } = await callerOf(runtime, params)
      // Why omitting `to` means the caller's own card: an agent can mute its own
      // notifications without needing to be told its own name.
      const target =
        params.to === undefined ? null : resolveConnectedPeer(snapshot, caller, params.to)
      const targetSessionId = target?.sessionId ?? caller
      const own = sessionNode(snapshot.document, caller)
      const targetLabel =
        target?.label ??
        (own !== null && own.content.kind === 'session' ? own.content.label : caller)
      const nodeId = sessionNode(snapshot.document, targetSessionId)?.id ?? null
      if (nodeId === null) {
        throw new AgentCanvasAccessError(
          'canvas_peer_not_found',
          `"${targetLabel}" has no card on this canvas.`
        )
      }
      const saved = getAgentCanvasStore().update((current) => ({
        ...current,
        document: patchSessionFlags(current.document, nodeId, { watched: params.watched })
      }))
      return {
        session: { sessionId: targetSessionId, label: targetLabel },
        watched: params.watched,
        revision: saved.revision
      }
    }
  }),
  defineMethod({
    name: 'canvas.floorCreate',
    params: AgentCanvasFloorCreateParams,
    handler: async (params, { runtime }) => {
      const { caller, snapshot } = await callerOf(runtime, params)
      if (!viewPeers(snapshot, caller).self.isLead) {
        throw new AgentCanvasAccessError(
          'canvas_not_lead',
          'Only a lead session may add floors. Ask the user to mark this session as lead on the Agent Canvas.'
        )
      }
      if (findLevelByName(snapshot.document, params.name) !== undefined) {
        throw new AgentCanvasAccessError(
          'canvas_floor_exists',
          `A floor named "${params.name}" already exists.`
        )
      }
      const created = createLevel(snapshot.document, {
        name: params.name,
        ...(params.branch === undefined ? {} : { branch: params.branch })
      })
      const saved = getAgentCanvasStore().update((current) => ({
        ...current,
        document: created.document
      }))
      return {
        floor: { id: created.levelId, name: params.name, branch: params.branch ?? null },
        revision: saved.revision
      }
    }
  }),
  defineMethod({
    name: 'canvas.noteRead',
    params: AgentCanvasNoteReadParams,
    handler: async (params, { runtime }) => {
      const { caller, snapshot } = await callerOf(runtime, params)
      return { note: resolveConnectedNote(snapshot, caller, params.note) }
    }
  }),
  defineMethod({
    name: 'canvas.noteWrite',
    params: AgentCanvasNoteWriteParams,
    handler: async (params, { runtime }) => {
      const { caller } = await callerOf(runtime, params)
      const store = getAgentCanvasStore()
      // Why: validate against the current snapshot before persisting so a cut wire refuses the write.
      const next = writeConnectedNote(store.get(), caller, params.note, params.body, params.mode)
      const saved = store.update(() => next)
      return { note: resolveConnectedNote(saved, caller, params.note), revision: saved.revision }
    }
  })
]
