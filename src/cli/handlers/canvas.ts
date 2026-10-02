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
type PeersResult = { self: SessionPeer; sessions: SessionPeer[]; notes: NoteView[] }
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

export const CANVAS_HANDLERS: Record<string, CommandHandler> = {
  'canvas peers': peers,
  'canvas ask': ask,
  'canvas note read': noteRead,
  'canvas note write': noteWrite
}
