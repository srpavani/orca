import { defineMethod } from '../core'
import {
  AgentCanvasAskParams,
  AgentCanvasCheckParams,
  AgentCanvasGetParams,
  AgentCanvasNoteReadParams,
  AgentCanvasNoteWriteParams,
  AgentCanvasNotifyParams,
  AgentCanvasPeersParams,
  AgentCanvasRecruitParams,
  AgentCanvasSaveParams
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
  getAgentCanvasStore,
  resolveCaller,
  saveCanvasFromClient,
  type CanvasTerminalRow
} from '../../../agent-canvas/agent-canvas-host'
import {
  resolveConnectedNote,
  viewPeers,
  writeConnectedNote
} from '../../../agent-canvas/agent-canvas-peers'
import type { AgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'

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
  const snapshot = ensureCallerPlaced(getAgentCanvasStore(), session)
  return { caller: session.sessionId, snapshot }
}

export const AGENT_CANVAS_METHODS = [
  defineMethod({
    name: 'canvas.get',
    params: AgentCanvasGetParams,
    handler: (params) => {
      const snapshot = getAgentCanvasStore().get()
      if (params.sinceRevision !== undefined && params.sinceRevision === snapshot.revision) {
        return { unchanged: true as const, revision: snapshot.revision }
      }
      return { unchanged: false as const, snapshot }
    }
  }),
  defineMethod({
    name: 'canvas.save',
    params: AgentCanvasSaveParams,
    handler: (params) => saveCanvasFromClient(getAgentCanvasStore(), params)
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
      return askConnectedPeer({
        snapshot,
        runtime: runtime as unknown as AgentCanvasAskRuntime,
        callerSessionId: caller,
        target: params.to,
        prompt: params.prompt,
        ...(params.timeoutMs ? { timeoutMs: params.timeoutMs } : {}),
        ...(signal ? { signal } : {})
      })
    }
  }),
  defineMethod({
    name: 'canvas.check',
    params: AgentCanvasCheckParams,
    handler: async (params, { runtime }) => {
      const { caller, snapshot } = await callerOf(runtime, params)
      return readConnectedPeer({
        snapshot,
        runtime: runtime as unknown as AgentCanvasAskRuntime,
        callerSessionId: caller,
        target: params.to,
        ...(params.lines === undefined ? {} : { lines: params.lines })
      })
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
