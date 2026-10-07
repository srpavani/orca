import type {
  RuntimeTerminalRead,
  RuntimeTerminalSend,
  RuntimeTerminalWait
} from '../../shared/runtime-terminal-contracts'
import type { AgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { AgentCanvasAccessError, resolveConnectedPeer } from './agent-canvas-peers'

/**
 * A peer resolved by the caller, e.g. across a project link. Why an override:
 * a linked session lives on another board, so the caller's board cannot resolve it.
 */
export type ResolvedCanvasPeer = { sessionId: string; label: string }
import { awaitAskBack, deliverAskBack } from './agent-canvas-ask-back'

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
  /** `reply`: this message answered the peer's open ask; nothing was typed. */
  delivered?: 'reply'
  /** `ask-back`: the peer answered with `ask` back rather than on its screen. */
  source?: 'ask-back' | 'screen'
}

export const DEFAULT_ASK_TIMEOUT_MS = 10 * 60 * 1000
const REPLY_LINE_LIMIT = 2000

export function framePrompt(callerLabel: string, prompt: string): string {
  return (
    `[Agent Canvas] Message from "${callerLabel}". Reply in your normal output; it is returned to them. ` +
    `For a long reply, run \`orca canvas ask "${callerLabel}" "<your full reply>"\` instead — it reaches them in full.` +
    `\n\n${prompt}`
  )
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
  peer?: ResolvedCanvasPeer
  /** How the peer addresses the caller back; a linked peer needs `Name @ Project`. */
  callerAddress?: string
}): Promise<AgentCanvasAskResult> {
  const { snapshot, runtime, callerSessionId } = input
  const peer = input.peer ?? resolveConnectedPeer(snapshot, callerSessionId, input.target)
  const caller = input.callerAddress ?? resolveCallerLabel(snapshot, callerSessionId)
  // Why before the terminal lookup: the peer is mid-ask and waiting on our answer,
  // so this message is that answer — typing it into its busy TUI would only queue it.
  if (deliverAskBack(callerSessionId, peer.sessionId, input.prompt)) {
    return {
      peer: { sessionId: peer.sessionId, label: peer.label, handle: '' },
      reply: '',
      settled: true,
      delivered: 'reply'
    }
  }
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
  const askBack = awaitAskBack(callerSessionId, peer.sessionId)
  const stopWaiting = new AbortController()
  const onAbort = (): void => stopWaiting.abort()
  input.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    await runtime.sendTerminalAgentPrompt(terminal.handle, framePrompt(caller, input.prompt), {
      inputKind: 'driving',
      acceptQueued: true,
      observationTimeoutMs: 0
    })
    const outcome = await Promise.race([
      askBack.reply.then((reply) => ({ kind: 'ask-back' as const, reply })),
      runtime
        .waitForTerminal(terminal.handle, {
          condition: 'tui-idle',
          timeoutMs: input.timeoutMs ?? DEFAULT_ASK_TIMEOUT_MS,
          signal: stopWaiting.signal
        })
        .then((wait) => ({ kind: 'idle' as const, wait }))
    ])
    const peerView = { sessionId: peer.sessionId, label: peer.label, handle: terminal.handle }
    if (outcome.kind === 'ask-back') {
      return { peer: peerView, reply: outcome.reply.trim(), settled: true, source: 'ask-back' }
    }
    const after = await runtime.readTerminal(terminal.handle, {
      ...(startCursor === undefined ? {} : { cursor: startCursor }),
      limit: REPLY_LINE_LIMIT
    })
    return {
      peer: peerView,
      reply: after.tail.join('\n').trim(),
      settled: outcome.wait.satisfied,
      source: 'screen',
      ...(outcome.wait.blockedReason ? { blockedReason: outcome.wait.blockedReason } : {})
    }
  } finally {
    askBack.dispose()
    // Why: an ask-back answer leaves the idle wait running; release it.
    stopWaiting.abort()
    input.signal?.removeEventListener('abort', onAbort)
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

/** The runtime call a raw keystroke needs; typed narrowly for tests. */
export type AgentCanvasInputRuntime = Pick<AgentCanvasAskRuntime, 'listTerminals'> & {
  sendTerminal(
    handle: string,
    action: { text: string },
    options: { inputKind: 'driving' }
  ): Promise<{ bytesWritten: number }>
}

/**
 * Types raw keys into a wired peer without waiting, like the reference's
 * `ask --raw`. Why: an agent that stopped on an approval menu cannot be
 * answered with a framed prompt; it needs the exact key ("2", Enter, Esc).
 */
export async function sendRawToConnectedPeer(input: {
  snapshot: AgentCanvasSnapshot
  runtime: AgentCanvasInputRuntime
  callerSessionId: string
  target: string
  text: string
  peer?: ResolvedCanvasPeer
}): Promise<{ peer: { sessionId: string; label: string; handle: string }; bytesWritten: number }> {
  const peer =
    input.peer ?? resolveConnectedPeer(input.snapshot, input.callerSessionId, input.target)
  const { terminals } = await input.runtime.listTerminals()
  const terminal = terminals.find(
    (candidate) => candidate.tabId === peer.sessionId && candidate.connected
  )
  if (!terminal) {
    throw new AgentCanvasAccessError(
      'canvas_peer_not_running',
      `"${peer.label}" is on the canvas but its terminal is not running.`
    )
  }
  const sent = await input.runtime.sendTerminal(
    terminal.handle,
    { text: input.text },
    { inputKind: 'driving' }
  )
  return {
    peer: { sessionId: peer.sessionId, label: peer.label, handle: terminal.handle },
    bytesWritten: sent.bytesWritten
  }
}

export const DEFAULT_CHECK_LINES = 60

export type AgentCanvasCheckResult = {
  peer: { sessionId: string; label: string; handle: string }
  /** The peer's current screen, escapes stripped, oldest line first. */
  output: string
  lines: number
}

/**
 * Reads what a wired peer is showing right now, without sending it anything.
 * This is the counterpart to `ask`: use it to see whether the work you
 * delegated has finished, instead of interrupting the agent with a message.
 */
export async function readConnectedPeer(input: {
  snapshot: AgentCanvasSnapshot
  runtime: AgentCanvasAskRuntime
  callerSessionId: string
  target: string
  lines?: number
  peer?: ResolvedCanvasPeer
}): Promise<AgentCanvasCheckResult> {
  const peer =
    input.peer ?? resolveConnectedPeer(input.snapshot, input.callerSessionId, input.target)
  const { terminals } = await input.runtime.listTerminals()
  const terminal = terminals.find((candidate) => candidate.tabId === peer.sessionId)
  if (!terminal) {
    throw new AgentCanvasAccessError(
      'canvas_peer_not_running',
      `"${peer.label}" is on the canvas but its terminal is not running.`
    )
  }
  const read = await input.runtime.readTerminal(terminal.handle, {
    limit: input.lines ?? DEFAULT_CHECK_LINES
  })
  return {
    peer: { sessionId: peer.sessionId, label: peer.label, handle: terminal.handle },
    output: read.tail.join('\n').trimEnd(),
    lines: read.tail.length
  }
}
