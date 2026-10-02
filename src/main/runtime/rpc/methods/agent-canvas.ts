import { defineMethod } from '../core'
import {
  AgentCanvasAskParams,
  AgentCanvasGetParams,
  AgentCanvasNoteReadParams,
  AgentCanvasNoteWriteParams,
  AgentCanvasPeersParams,
  AgentCanvasSaveParams
} from '../../../../shared/rpc-contract/agent-canvas-params'
import {
  askConnectedPeer,
  type AgentCanvasAskRuntime
} from '../../../agent-canvas/agent-canvas-ask'
import {
  getAgentCanvasStore,
  resolveCallerSessionId,
  saveCanvasFromClient
} from '../../../agent-canvas/agent-canvas-host'
import {
  resolveConnectedNote,
  viewPeers,
  writeConnectedNote
} from '../../../agent-canvas/agent-canvas-peers'

type TerminalLister = {
  listTerminals(): Promise<{ terminals: { handle: string; tabId: string; connected: boolean }[] }>
}

function callerOf(
  runtime: TerminalLister,
  params: { callerTerminal?: string; callerTabId?: string }
): Promise<string> {
  return resolveCallerSessionId(params, () => runtime.listTerminals())
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
    handler: async (params, { runtime }) =>
      viewPeers(getAgentCanvasStore().get(), await callerOf(runtime, params))
  }),
  defineMethod({
    name: 'canvas.ask',
    params: AgentCanvasAskParams,
    handler: async (params, { runtime, signal }) =>
      askConnectedPeer({
        snapshot: getAgentCanvasStore().get(),
        runtime: runtime as unknown as AgentCanvasAskRuntime,
        callerSessionId: await callerOf(runtime, params),
        target: params.to,
        prompt: params.prompt,
        ...(params.timeoutMs ? { timeoutMs: params.timeoutMs } : {}),
        ...(signal ? { signal } : {})
      })
  }),
  defineMethod({
    name: 'canvas.noteRead',
    params: AgentCanvasNoteReadParams,
    handler: async (params, { runtime }) => ({
      note: resolveConnectedNote(
        getAgentCanvasStore().get(),
        await callerOf(runtime, params),
        params.note
      )
    })
  }),
  defineMethod({
    name: 'canvas.noteWrite',
    params: AgentCanvasNoteWriteParams,
    handler: async (params, { runtime }) => {
      const caller = await callerOf(runtime, params)
      const store = getAgentCanvasStore()
      // Why: validate against the current snapshot before persisting so a cut wire refuses the write.
      const next = writeConnectedNote(store.get(), caller, params.note, params.body, params.mode)
      const saved = store.update(() => next)
      return { note: resolveConnectedNote(saved, caller, params.note), revision: saved.revision }
    }
  })
]
