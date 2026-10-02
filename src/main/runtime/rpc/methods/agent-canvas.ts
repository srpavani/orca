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
