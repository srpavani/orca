import { defineMethod } from '../core'
import {
  AgentCanvasFloorCreateParams,
  AgentCanvasGetParams,
  AgentCanvasNoteReadParams,
  AgentCanvasNoteWriteParams,
  AgentCanvasNotifyParams,
  AgentCanvasSaveParams,
  AgentCanvasStatusParams,
  AgentCanvasWatchParams
} from '../../../../shared/rpc-contract/agent-canvas-params'
import { notifyUser } from '../../../agent-canvas/agent-canvas-notify'
import {
  canvasProjectKeyOf,
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
  writeConnectedNote
} from '../../../agent-canvas/agent-canvas-peers'
import { createLevel } from '../../../../shared/spatial-canvas/level-edits'
import { sessionNode } from '../../../../shared/spatial-canvas/levels'
import { findLevelByName } from '../../../../shared/spatial-canvas/recruit'
import { patchSessionFlags } from '../../../../shared/spatial-canvas/node-flags'
import type { AgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'
import type { CanvasLiveSession } from '../../../../shared/spatial-canvas/session-placement'
import type { AgentCanvasStore } from '../../../agent-canvas/agent-canvas-store'
import {
  activeTransferEdgeIds,
  edgesBetweenSessions
} from '../../../agent-canvas/agent-canvas-transfers'

/** The wires a message from `caller` to `target` crosses; none when the target does not resolve. */
export function transferEdges(
  snapshot: AgentCanvasSnapshot,
  caller: string,
  target: string
): string[] {
  try {
    const peer = resolveConnectedPeer(snapshot, caller, target)
    return edgesBetweenSessions(snapshot.document, caller, peer.sessionId)
  } catch {
    return []
  }
}

type TerminalLister = SonarRuntime & {
  listTerminals(): Promise<{ terminals: CanvasTerminalRow[] }>
}

/**
 * Resolves the calling agent and makes sure its card exists, so the canvas
 * works for agents even if the user never opened the canvas view. The snapshot
 * returned already contains the caller.
 */
export async function callerOf(
  runtime: TerminalLister,
  params: { callerTerminal?: string; callerTabId?: string }
): Promise<{
  caller: string
  session: CanvasLiveSession
  snapshot: AgentCanvasSnapshot
  store: AgentCanvasStore
  /** The caller's project board; null when its terminal has no workspace. */
  projectKey: string | null
}> {
  const session = await resolveCaller(params, () => runtime.listTerminals())
  const projectKey = canvasProjectKeyOf(session)
  const store = getAgentCanvasStore(projectKey)
  const snapshot = ensureCallerPlaced(store, session)
  // Why here: every agent-facing canvas command passes through, so the watch
  // starts the first time the canvas is actually used and never at boot.
  ensureSonarRunning(store, runtime, projectKey)
  return { caller: session.sessionId, session, snapshot, store, projectKey }
}

export const AGENT_CANVAS_METHODS = [
  defineMethod({
    name: 'canvas.get',
    params: AgentCanvasGetParams,
    // Why the watch also starts here: the user turns Sonar on from the canvas UI (not from a
    // terminal), so the renderer's own read/write must arm it too — otherwise a card could
    // show a watching eye while nothing was actually watching.
    handler: (params, { runtime }) => {
      const projectKey = params.projectKey ?? null
      const store = getAgentCanvasStore(projectKey)
      ensureSonarRunning(store, runtime, projectKey)
      const snapshot = store.get()
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
      const projectKey = params.projectKey ?? null
      const store = getAgentCanvasStore(projectKey)
      ensureSonarRunning(store, runtime, projectKey)
      return saveCanvasFromClient(store, params)
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
      const { terminals } = await runtime.listTerminals()
      return { sessions: viewStatus(snapshot, caller, terminals, Date.now()) }
    }
  }),
  defineMethod({
    name: 'canvas.watch',
    params: AgentCanvasWatchParams,
    handler: async (params, { runtime }) => {
      const { caller, snapshot, store } = await callerOf(runtime, params)
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
      const saved = store.update((current) => ({
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
      const { caller, snapshot, store } = await callerOf(runtime, params)
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
      const saved = store.update((current) => ({
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
      const { caller, store } = await callerOf(runtime, params)
      // Why: validate against the current snapshot before persisting so a cut wire refuses the write.
      const next = writeConnectedNote(store.get(), caller, params.note, params.body, params.mode)
      const saved = store.update(() => next)
      return { note: resolveConnectedNote(saved, caller, params.note), revision: saved.revision }
    }
  })
]
