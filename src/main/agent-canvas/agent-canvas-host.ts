import { getAppEnvironment } from '../../shared/app-environment'
import {
  parseCanvasDocument,
  parseCanvasNotes,
  parseCanvasViewport,
  type AgentCanvasSnapshot
} from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { sessionNode } from '../../shared/spatial-canvas/levels'
import {
  syncSessionNodes,
  type CanvasLiveSession
} from '../../shared/spatial-canvas/session-placement'
import { AgentCanvasAccessError } from './agent-canvas-peers'
import { notifyUser } from './agent-canvas-notify'
import { AgentCanvasSonar, type SonarRuntime } from './agent-canvas-sonar'
import { sonarMessage } from '../../shared/spatial-canvas/sonar'
import { AgentCanvasStore } from './agent-canvas-store'

let store: AgentCanvasStore | null = null

/** One store per process, created on first use so tests and the CLI never touch disk early. */
export function getAgentCanvasStore(): AgentCanvasStore {
  store ??= new AgentCanvasStore(getAppEnvironment().getPath('userData'))
  return store
}

export function setAgentCanvasStoreForTests(next: AgentCanvasStore | null): void {
  store = next
}

export type AgentCanvasSaveResult =
  | { accepted: true; snapshot: AgentCanvasSnapshot }
  | { accepted: false; reason: 'stale' | 'invalid'; snapshot: AgentCanvasSnapshot }

/**
 * Optimistic concurrency: a renderer save built on an older revision would
 * silently erase a note an agent just wrote, so it is refused and the client
 * re-applies its edit on top of the current snapshot.
 */
export function saveCanvasFromClient(
  target: AgentCanvasStore,
  input: {
    baseRevision: number
    document: unknown
    viewport: unknown
    notes: Record<string, string>
  }
): AgentCanvasSaveResult {
  const current = target.get()
  if (input.baseRevision !== current.revision) {
    return { accepted: false, reason: 'stale', snapshot: current }
  }
  const document = parseCanvasDocument(input.document)
  if (document === null) {
    return { accepted: false, reason: 'invalid', snapshot: current }
  }
  const snapshot = target.update(() => ({
    document,
    viewport: parseCanvasViewport(input.viewport),
    notes: parseCanvasNotes(input.notes),
    revision: current.revision
  }))
  return { accepted: true, snapshot }
}

export type AgentCanvasCallerSource = {
  callerTerminal?: string
  callerTabId?: string
}

export type CanvasTerminalRow = {
  handle: string
  tabId: string
  title?: string | null
  worktreeId?: string
  branch?: string | null
}

/**
 * Maps the CLI's terminal handle to the canvas session (the Orca tab id plus
 * what is needed to place it). The handle is resolved on the host, so the
 * env-supplied tab id is only a fallback for shells that predate handle injection.
 */
export async function resolveCaller(
  source: AgentCanvasCallerSource,
  listTerminals: () => Promise<{ terminals: CanvasTerminalRow[] }>
): Promise<CanvasLiveSession> {
  const { terminals } = await listTerminals()
  const match =
    (source.callerTerminal
      ? terminals.find((terminal) => terminal.handle === source.callerTerminal)
      : undefined) ??
    (source.callerTabId
      ? terminals.find((terminal) => terminal.tabId === source.callerTabId)
      : undefined)
  if (match) {
    return {
      sessionId: match.tabId,
      label: match.title?.trim() || match.tabId,
      worktreeId: match.worktreeId ?? '',
      branch: match.branch ?? null
    }
  }
  if (source.callerTabId) {
    return {
      sessionId: source.callerTabId,
      label: source.callerTabId,
      worktreeId: '',
      branch: null
    }
  }
  throw new AgentCanvasAccessError(
    'canvas_caller_not_on_canvas',
    'Run this command from an Orca terminal; no ORCA_TERMINAL_HANDLE or ORCA_TAB_ID was found.'
  )
}

/** Back-compat helper for callers that only need the session id. */
export async function resolveCallerSessionId(
  source: AgentCanvasCallerSource,
  listTerminals: () => Promise<{ terminals: CanvasTerminalRow[] }>
): Promise<string> {
  return (await resolveCaller(source, listTerminals)).sessionId
}

/**
 * Puts the calling session on the canvas if it is not there yet, on the floor
 * pinned to its branch. Why: an agent must be able to use the canvas before
 * anyone opens the canvas view. Placing grants nothing by itself — a fresh card
 * has no wires, so the agent still reaches no one until the user connects it.
 */
export function ensureCallerPlaced(
  target: AgentCanvasStore,
  caller: CanvasLiveSession
): AgentCanvasSnapshot {
  const current = target.get()
  if (sessionNode(current.document, caller.sessionId)) {
    return current
  }
  return target.update((snapshot) => ({
    ...snapshot,
    document: syncSessionNodes(snapshot.document, [caller])
  }))
}

let sonar: AgentCanvasSonar | null = null

/**
 * Starts Sonar on first canvas use. Why lazy rather than at boot: a user who
 * never opens the canvas pays nothing for the watch, and the canvas knows its
 * runtime from the first RPC that drives it.
 */
export function ensureSonarRunning(target: AgentCanvasStore, runtime: SonarRuntime): void {
  if (sonar !== null) {
    return
  }
  sonar = new AgentCanvasSonar(target, runtime, (notification) => {
    // Why delivered from here: the watcher decides *whether* to speak, the
    // notification module decides how. Keeping them apart is what lets the
    // decision be tested without Electron.
    const text = sonarMessage(notification)
    notifyUser(text.body, text.title)
  })
  sonar.start()
}

export function stopSonar(): void {
  sonar?.stop()
  sonar = null
}

export function getSonar(): AgentCanvasSonar | null {
  return sonar
}
