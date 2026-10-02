import type {
  RuntimeTerminalRead,
  RuntimeTerminalSend,
  RuntimeTerminalWait
} from '../../shared/runtime-terminal-contracts'
import type { AgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { AgentCanvasAccessError, resolveConnectedPeer } from './agent-canvas-peers'

/** The slice of the Orca runtime an ask drives; kept narrow so tests can fake it. */
export type AgentCanvasAskRuntime = {
  listTerminals(): Promise<{ terminals: { handle: string; tabId: string; connected: boolean }[] }>
  readTerminal(
    handle: string,
    opts: { cursor?: number; limit?: number }
  ): Promise<RuntimeTerminalRead>
  sendTerminalAgentPrompt(
    handle: string,
    prompt: string,
    options: { inputKind: 'driving'; acceptQueued: true; observationTimeoutMs: number }
  ): Promise<RuntimeTerminalSend>
  waitForTerminal(
    handle: string,
    options: { condition: 'tui-idle'; timeoutMs: number; signal?: AbortSignal }
  ): Promise<RuntimeTerminalWait>
}

export type AgentCanvasAskResult = {
  peer: { sessionId: string; label: string; handle: string }
  /** Output the peer produced after the prompt, escape sequences stripped. */
  reply: string
  /** False when the wait timed out or the peer stopped on a blocking prompt. */
  settled: boolean
  blockedReason?: string
}

export const DEFAULT_ASK_TIMEOUT_MS = 10 * 60 * 1000
const REPLY_LINE_LIMIT = 2000

export function framePrompt(callerLabel: string, prompt: string): string {
  return `[Agent Canvas] Message from "${callerLabel}". Reply in your normal output; it is returned to them.\n\n${prompt}`
}

function parseCursor(cursor: string | null | undefined): number | undefined {
  if (!cursor || !/^\d+$/.test(cursor)) {
    return undefined
  }
  return Number.parseInt(cursor, 10)
}

/**
 * Sends `prompt` to a wired peer and waits for its turn to finish. The wire
 * check happens before any byte is written, so cutting a wire on the canvas
 * immediately stops new asks — one hop, never through a third session.
 */
export async function askConnectedPeer(input: {
  snapshot: AgentCanvasSnapshot
  runtime: AgentCanvasAskRuntime
  callerSessionId: string
  target: string
  prompt: string
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<AgentCanvasAskResult> {
  const { snapshot, runtime, callerSessionId } = input
  const peer = resolveConnectedPeer(snapshot, callerSessionId, input.target)
  const caller = resolveCallerLabel(snapshot, callerSessionId)
  const { terminals } = await runtime.listTerminals()
  const terminal = terminals.find(
    (candidate) => candidate.tabId === peer.sessionId && candidate.connected
  )
  if (!terminal) {
    throw new AgentCanvasAccessError(
      'canvas_peer_not_running',
      `"${peer.label}" is on the canvas but its terminal is not running.`
    )
  }
  const before = await runtime.readTerminal(terminal.handle, { limit: 1 })
  const startCursor = parseCursor(before.latestCursor ?? before.nextCursor)
  await runtime.sendTerminalAgentPrompt(terminal.handle, framePrompt(caller, input.prompt), {
    inputKind: 'driving',
    acceptQueued: true,
    observationTimeoutMs: 0
  })
  const wait = await runtime.waitForTerminal(terminal.handle, {
    condition: 'tui-idle',
    timeoutMs: input.timeoutMs ?? DEFAULT_ASK_TIMEOUT_MS,
    ...(input.signal ? { signal: input.signal } : {})
  })
  const after = await runtime.readTerminal(terminal.handle, {
    ...(startCursor === undefined ? {} : { cursor: startCursor }),
    limit: REPLY_LINE_LIMIT
  })
  return {
    peer: { sessionId: peer.sessionId, label: peer.label, handle: terminal.handle },
    reply: after.tail.join('\n').trim(),
    settled: wait.satisfied,
    ...(wait.blockedReason ? { blockedReason: wait.blockedReason } : {})
  }
}

function resolveCallerLabel(snapshot: AgentCanvasSnapshot, callerSessionId: string): string {
  for (const node of [
    ...snapshot.document.root.nodes,
    ...snapshot.document.levels.flatMap((level) => level.nodes)
  ]) {
    if (node.content.kind === 'session' && node.content.sessionId === callerSessionId) {
      return node.content.label
    }
  }
  return callerSessionId
}
