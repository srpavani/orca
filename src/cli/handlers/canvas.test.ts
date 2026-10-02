import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../dispatch'
import { CANVAS_HANDLERS, callerParams, formatAsk, formatBatch, formatPeers } from './canvas'

const originalHandle = process.env.ORCA_TERMINAL_HANDLE
const originalTab = process.env.ORCA_TAB_ID

afterEach(() => {
  for (const [key, value] of [
    ['ORCA_TERMINAL_HANDLE', originalHandle],
    ['ORCA_TAB_ID', originalTab]
  ] as const) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  process.exitCode = undefined
  vi.restoreAllMocks()
})

function context(flags: Record<string, string | boolean>, result: unknown) {
  const call = vi.fn(async () => ({ id: '1', ok: true, result, _meta: { runtimeId: 'rt' } }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const ctx = {
    flags: new Map(Object.entries(flags)),
    client: { call },
    cwd: '/',
    json: true
  } as unknown as HandlerContext
  return { ctx, call }
}

describe('callerParams', () => {
  it('sends the handle and tab id from the PTY env and skips blanks', () => {
    expect(callerParams({ ORCA_TERMINAL_HANDLE: 'term_1', ORCA_TAB_ID: ' ' })).toEqual({
      callerTerminal: 'term_1'
    })
    expect(callerParams({})).toEqual({})
  })
})

describe('canvas handlers', () => {
  it('ask forwards caller, target, prompt and a longer transport timeout', async () => {
    process.env.ORCA_TERMINAL_HANDLE = 'term_me'
    delete process.env.ORCA_TAB_ID
    const { ctx, call } = context(
      { to: 'Beta', prompt: 'hi', 'timeout-ms': '60000' },
      { peer: { sessionId: 'b', label: 'Beta', handle: 'term_b' }, reply: 'yo', settled: true }
    )
    await CANVAS_HANDLERS['canvas ask']!(ctx)
    expect(call).toHaveBeenCalledWith(
      'canvas.ask',
      { callerTerminal: 'term_me', to: 'Beta', prompt: 'hi', timeoutMs: 60000 },
      { timeoutMs: 90000 }
    )
    expect(process.exitCode).toBeUndefined()
  })

  it('ask exits non-zero when the peer did not settle', async () => {
    const { ctx } = context(
      { to: 'Beta', prompt: 'hi' },
      { peer: { sessionId: 'b', label: 'Beta', handle: 'h' }, reply: '', settled: false }
    )
    await CANVAS_HANDLERS['canvas ask']!(ctx)
    expect(process.exitCode).toBe(1)
  })

  it('note write expands \\n and maps --append', async () => {
    const { ctx, call } = context(
      { note: 'Plan', text: 'a\\nb', append: true },
      { note: { displayName: 'Plan' }, revision: 3 }
    )
    await CANVAS_HANDLERS['canvas note write']!(ctx)
    expect(call).toHaveBeenCalledWith(
      'canvas.noteWrite',
      expect.objectContaining({ note: 'Plan', body: 'a\nb', mode: 'append' })
    )
  })
})

describe('formatting', () => {
  it('renders peers with an empty-state hint and indented note chains', () => {
    const text = formatPeers({
      self: { sessionId: 'a', label: 'Alpha', isLead: false },
      sessions: [],
      notes: [
        { noteId: 'p', displayName: 'Plan', depth: 0, readOnly: false, body: 'step 1\nmore' },
        { noteId: 'd', displayName: 'Detail', depth: 1, readOnly: true, body: 'x' }
      ],
      floors: [
        { name: 'Ground', branch: null, sessions: 2, current: true },
        { name: 'Experiment', branch: 'feature/x', sessions: 1, current: false }
      ]
    })
    expect(text).toContain('ask the user to wire you')
    expect(text).toContain('  - Plan: step 1')
    expect(text).toContain('    - Detail [read-only]: x')
    expect(text).toContain('  - Ground: 2 session(s) ← you are here')
    expect(text).toContain('  - Experiment [feature/x]: 1 session(s)')
  })

  it('renders a batch reply per peer, marking failures and unfinished work', () => {
    const text = formatBatch({
      replies: [
        { label: 'Backend', reply: 'port 3000', settled: true },
        { label: 'Slow', reply: 'working', settled: false },
        { label: 'Gone', error: 'canvas_peer_not_connected' }
      ]
    })
    expect(text).toContain('── Backend ──\nport 3000')
    expect(text).toContain('(not settled — still working)')
    expect(text).toContain('(failed: canvas_peer_not_connected)')
  })

  it('marks an unsettled reply', () => {
    expect(
      formatAsk({
        peer: { sessionId: 'b', label: 'Beta', handle: 'h' },
        reply: '',
        settled: false,
        blockedReason: 'agent-approval-prompt'
      })
    ).toContain('not settled: agent-approval-prompt')
  })
})
