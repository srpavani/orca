import { getAppEnvironment } from '../../shared/app-environment'
import {
  parseCanvasDocument,
  parseCanvasNotes,
  parseCanvasViewport,
  type AgentCanvasSnapshot
} from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { AgentCanvasAccessError } from './agent-canvas-peers'
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

/**
 * Maps the CLI's terminal handle to the canvas session id (the Orca tab id).
 * The handle is resolved on the host, so the env-supplied tab id is only a
 * fallback for shells that predate handle injection.
 */
export async function resolveCallerSessionId(
  source: AgentCanvasCallerSource,
  listTerminals: () => Promise<{ terminals: { handle: string; tabId: string }[] }>
): Promise<string> {
  if (source.callerTerminal) {
    const { terminals } = await listTerminals()
    const match = terminals.find((terminal) => terminal.handle === source.callerTerminal)
    if (match) {
      return match.tabId
    }
  }
  if (source.callerTabId) {
    return source.callerTabId
  }
  throw new AgentCanvasAccessError(
    'canvas_caller_not_on_canvas',
    'Run this command from an Orca terminal; no ORCA_TERMINAL_HANDLE or ORCA_TAB_ID was found.'
  )
}
