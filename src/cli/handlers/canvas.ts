import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { getOptionalPositiveIntegerFlag, getRequiredStringFlag } from '../flags'

type SessionPeer = { sessionId: string; label: string; isLead: boolean }
type NoteView = {
  noteId: string
  displayName: string
  depth: number
  readOnly: boolean
  body: string
}
type PeersResult = {
  self: SessionPeer
  sessions: SessionPeer[]
  notes: NoteView[]
  floors: { name: string; branch: string | null; sessions: number; current: boolean }[]
}
type AskResult = {
  peer: { sessionId: string; label: string; handle: string }
  reply: string
  settled: boolean
  blockedReason?: string
}

// Why: ask legitimately outlives the CLI's generic RPC timeout; leave headroom over the server wait.
const DEFAULT_ASK_RPC_TIMEOUT_MS = 11 * 60 * 1000

/** Identity comes from the PTY env Orca injects; the host resolves the handle to its tab. */
export function callerParams(env: NodeJS.ProcessEnv = process.env): {
  callerTerminal?: string
  callerTabId?: string
} {
  const handle = env.ORCA_TERMINAL_HANDLE?.trim()
  const tabId = env.ORCA_TAB_ID?.trim()
  return {
    ...(handle ? { callerTerminal: handle } : {}),
    ...(tabId ? { callerTabId: tabId } : {})
  }
}

export function formatPeers(result: PeersResult): string {
  const lines = [`You are "${result.self.label}".`, '', 'Sessions you can ask:']
  if (result.sessions.length === 0) {
    lines.push('  (none — ask the user to wire you to another session on the Agent Canvas)')
  }
  for (const peer of result.sessions) {
    lines.push(`  - ${peer.label}${peer.isLead ? ' (lead)' : ''}`)
  }
  lines.push('', 'Notes you can read:')
  if (result.notes.length === 0) {
    lines.push('  (none)')
  }
  for (const note of result.notes) {
    const indent = '  '.repeat(note.depth + 1)
    const flag = note.readOnly ? ' [read-only]' : ''
    const firstLine = note.body.split('\n')[0] ?? ''
    lines.push(`${indent}- ${note.displayName}${flag}: ${firstLine.slice(0, 80)}`)
  }
  lines.push('', 'Floors (pass a name to `recruit --floor`):')
  for (const floor of result.floors) {
    const where = floor.current ? ' ← you are here' : ''
    const branch = floor.branch ? ` [${floor.branch}]` : ''
    lines.push(`  - ${floor.name}${branch}: ${floor.sessions} session(s)${where}`)
  }
  return lines.join('\n')
}

export function formatAsk(result: AskResult): string {
  const header = `── reply from ${result.peer.label} ──`
  const footer = result.settled
    ? ''
    : `\n(not settled${result.blockedReason ? `: ${result.blockedReason}` : ''} — check the peer terminal)`
  return `${header}\n${result.reply || '(no output)'}${footer}`
}

async function peers(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<PeersResult>('canvas.peers', callerParams())
  printResult(response, ctx.json, formatPeers)
}

async function ask(ctx: HandlerContext): Promise<void> {
  const batch = ctx.flags.get('batch')
  if (typeof batch === 'string' && batch.length > 0) {
    await askBatch(ctx, batch)
    return
  }
  const timeoutMs = getOptionalPositiveIntegerFlag(ctx.flags, 'timeout-ms')
  const response = await ctx.client.call<AskResult>(
    'canvas.ask',
    {
      ...callerParams(),
      to: getRequiredStringFlag(ctx.flags, 'to'),
      prompt: getRequiredStringFlag(ctx.flags, 'prompt'),
      ...(timeoutMs ? { timeoutMs } : {})
    },
    { timeoutMs: timeoutMs ? timeoutMs + 30_000 : DEFAULT_ASK_RPC_TIMEOUT_MS }
  )
  printResult(response, ctx.json, formatAsk)
  if (!response.result.settled) {
    process.exitCode = 1
  }
}

type BatchReplies = { label: string; reply?: string; error?: string; settled?: boolean }

/**
 * Asks several peers at once, in parallel. Each peer may take minutes, so the
 * batch costs the slowest one rather than the sum — the whole point of having a
 * team on the canvas.
 */
async function askBatch(ctx: HandlerContext, raw: string): Promise<void> {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--batch expects a JSON object of {"Peer Name": "prompt"}')
  }
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.length === 0) {
    throw new Error('--batch received no targets')
  }
  const replies = await Promise.all(
    entries.map(async ([to, prompt]): Promise<BatchReplies> => {
      if (typeof prompt !== 'string' || prompt.length === 0) {
        return { label: to, error: 'prompt must be a non-empty string' }
      }
      try {
        const response = await ctx.client.call<AskResult>(
          'canvas.ask',
          { ...callerParams(), to, prompt },
          { timeoutMs: DEFAULT_ASK_RPC_TIMEOUT_MS }
        )
        return {
          label: response.result.peer.label,
          reply: response.result.reply,
          settled: response.result.settled
        }
      } catch (error) {
        return { label: to, error: error instanceof Error ? error.message : 'ask failed' }
      }
    })
  )
  printResult({ replies } as never, ctx.json, formatBatch)
  if (replies.some((entry) => entry.error || entry.settled === false)) {
    process.exitCode = 1
  }
}

export function formatBatch(result: { replies: BatchReplies[] }): string {
  return result.replies
    .map((entry) => {
      const body = entry.error
        ? `(failed: ${entry.error})`
        : `${entry.reply || '(no output)'}${entry.settled === false ? '\n(not settled — still working)' : ''}`
      return `── ${entry.label} ──\n${body}`
    })
    .join('\n\n')
}

async function noteRead(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<{ note: NoteView }>('canvas.noteRead', {
    ...callerParams(),
    note: getRequiredStringFlag(ctx.flags, 'note')
  })
  printResult(response, ctx.json, (result) => result.note.body)
}

async function noteWrite(ctx: HandlerContext): Promise<void> {
  // Why: shells pass "\n" literally; agents write multi-line plans as one argument.
  const text = getRequiredStringFlag(ctx.flags, 'text').replace(/\\n/g, '\n')
  const response = await ctx.client.call<{ note: NoteView; revision: number }>('canvas.noteWrite', {
    ...callerParams(),
    note: getRequiredStringFlag(ctx.flags, 'note'),
    body: text,
    mode: ctx.flags.get('append') === true ? 'append' : 'replace'
  })
  printResult(response, ctx.json, (result) => `Saved note "${result.note.displayName}".`)
}

type CheckResult = {
  peer: { sessionId: string; label: string; handle: string }
  output: string
  lines: number
}
type RecruitResult = {
  session: { sessionId: string; label: string; handle: string }
  floor: string | null
  bridged: boolean
  revision: number
}
type NotifyResult = { delivered: boolean; reason?: string }

async function check(ctx: HandlerContext): Promise<void> {
  const lines = getOptionalPositiveIntegerFlag(ctx.flags, 'lines')
  const response = await ctx.client.call<CheckResult>('canvas.check', {
    ...callerParams(),
    to: getRequiredStringFlag(ctx.flags, 'to'),
    ...(lines ? { lines } : {})
  })
  printResult(
    response,
    ctx.json,
    (result) => `── ${result.peer.label} is showing ──\n${result.output || '(no output)'}`
  )
}

async function recruit(ctx: HandlerContext): Promise<void> {
  const name = getRequiredStringFlag(ctx.flags, 'name')
  const response = await ctx.client.call<RecruitResult>(
    'canvas.recruit',
    {
      ...callerParams(),
      name,
      ...optional('agent', ctx),
      ...optional('command', ctx),
      ...optional('prompt', ctx),
      ...optional('cwd', ctx),
      ...optional('floor', ctx)
    },
    // Spawning a terminal is slower than a read; leave room for the PTY to come up.
    { timeoutMs: 60_000 }
  )
  printResult(response, ctx.json, formatRecruit)
}

function formatRecruit(result: RecruitResult): string {
  const where = result.floor === null ? 'the ground floor' : 'its own floor'
  const link = result.bridged ? 'bridged to you' : 'wired to you'
  return `Recruited "${result.session.label}" (${result.session.sessionId}) on ${where}, ${link}.`
}

function optional(flag: string, ctx: HandlerContext): Record<string, string> {
  const value = ctx.flags.get(flag)
  return typeof value === 'string' && value.length > 0 ? { [flag]: value } : {}
}

async function notify(ctx: HandlerContext): Promise<void> {
  const title = ctx.flags.get('title')
  const response = await ctx.client.call<NotifyResult>('canvas.notify', {
    message: getRequiredStringFlag(ctx.flags, 'message'),
    ...(typeof title === 'string' && title.length > 0 ? { title } : {})
  })
  printResult(response, ctx.json, (result) =>
    result.delivered ? 'Notified.' : `Not delivered (${result.reason ?? 'unknown'}).`
  )
}

export const CANVAS_HANDLERS: Record<string, CommandHandler> = {
  'canvas peers': peers,
  'canvas ask': ask,
  'canvas check': check,
  'canvas recruit': recruit,
  'canvas notify': notify,
  'canvas note read': noteRead,
  'canvas note write': noteWrite
}
