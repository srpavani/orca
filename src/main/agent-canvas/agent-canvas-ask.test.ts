import { describe, expect, it, vi } from 'vitest'
import {
  addNode,
  connectNodes,
  createDocument,
  createSessionNode
} from '../../shared/spatial-canvas/document'
import { emptyAgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { askConnectedPeer, framePrompt, type AgentCanvasAskRuntime } from './agent-canvas-ask'
import { AgentCanvasAccessError } from './agent-canvas-peers'

function snapshotWith(wired: boolean) {
  let next = 0
  const id = () => `n${++next}`
  const alpha = createSessionNode({ sessionId: 'tab-a', label: 'Alpha', at: { x: 0, y: 0 }, id })
  const beta = createSessionNode({ sessionId: 'tab-b', label: 'Beta', at: { x: 0, y: 0 }, id })
  let document = addNode(addNode(createDocument(), alpha), beta)
  if (wired) {
    document = connectNodes(document, alpha.id, beta.id, 'now', id)!.document
  }
  return { ...emptyAgentCanvasSnapshot(), document }
}

function fakeRuntime(options: { betaConnected?: boolean; neverIdle?: boolean } = {}) {
  const calls: string[] = []
  const prompts: string[] = []
  const runtime: AgentCanvasAskRuntime = {
    async listTerminals() {
      return {
        terminals: [
          { handle: 'term_a', tabId: 'tab-a', connected: true },
          { handle: 'term_b', tabId: 'tab-b', connected: options.betaConnected ?? true }
        ]
      }
    },
    async readTerminal(handle, opts) {
      calls.push(`read:${handle}:${opts.cursor ?? 'none'}`)
      return opts.cursor === undefined
        ? {
            handle,
            status: 'running',
            tail: ['old'],
            truncated: false,
            nextCursor: '40',
            latestCursor: '42'
          }
        : {
            handle,
            status: 'running',
            tail: ['', 'the answer is 7', ''],
            truncated: false,
            nextCursor: '50'
          }
    },
    async sendTerminalAgentPrompt(handle, prompt) {
      calls.push(`send:${handle}`)
      prompts.push(prompt)
      return { handle, accepted: true, bytesWritten: prompt.length }
    },
    async waitForTerminal(handle, opts) {
      calls.push(`wait:${handle}`)
      if (options.neverIdle) {
        // Stays busy until the ask releases the wait.
        await new Promise((resolve) => opts.signal?.addEventListener('abort', resolve))
      }
      return { handle, condition: 'tui-idle', satisfied: true, status: 'running', exitCode: null }
    }
  }
  return { runtime, calls, prompts }
}

describe('askConnectedPeer', () => {
  it('sends, waits for idle, and returns only output produced after the prompt', async () => {
    const { runtime, calls, prompts } = fakeRuntime()
    const result = await askConnectedPeer({
      snapshot: snapshotWith(true),
      runtime,
      callerSessionId: 'tab-a',
      target: 'beta',
      prompt: 'what is 3+4?'
    })
    expect(calls).toEqual(['read:term_b:none', 'send:term_b', 'wait:term_b', 'read:term_b:42'])
    expect(prompts).toEqual([framePrompt('Alpha', 'what is 3+4?')])
    expect(result).toEqual({
      peer: { sessionId: 'tab-b', label: 'Beta', handle: 'term_b' },
      reply: 'the answer is 7',
      settled: true,
      source: 'screen'
    })
  })

  it('writes nothing when the wire is missing', async () => {
    const { runtime, calls } = fakeRuntime()
    await expect(
      askConnectedPeer({
        snapshot: snapshotWith(false),
        runtime,
        callerSessionId: 'tab-a',
        target: 'Beta',
        prompt: 'hi'
      })
    ).rejects.toMatchObject({ code: 'canvas_peer_not_connected' })
    expect(calls).toEqual([])
  })

  it('refuses a wired peer whose terminal is not running', async () => {
    const { runtime } = fakeRuntime({ betaConnected: false })
    const attempt = askConnectedPeer({
      snapshot: snapshotWith(true),
      runtime,
      callerSessionId: 'tab-a',
      target: 'Beta',
      prompt: 'hi'
    })
    await expect(attempt).rejects.toBeInstanceOf(AgentCanvasAccessError)
    await expect(attempt).rejects.toMatchObject({ code: 'canvas_peer_not_running' })
  })
})

describe('ask back', () => {
  it("answers the peer's open ask in full instead of scraping its screen", async () => {
    const { runtime, calls } = fakeRuntime({ neverIdle: true })
    const snapshot = snapshotWith(true)
    const pending = askConnectedPeer({
      snapshot,
      runtime,
      callerSessionId: 'tab-a',
      target: 'Beta',
      prompt: 'review the diff'
    })
    await vi.waitFor(() => expect(calls).toContain('wait:term_b'))
    const back = await askConnectedPeer({
      snapshot,
      runtime,
      callerSessionId: 'tab-b',
      target: 'Alpha',
      prompt: 'line 1\nline 2 of a long review'
    })
    expect(back).toMatchObject({ delivered: 'reply', peer: { label: 'Alpha' } })
    await expect(pending).resolves.toMatchObject({
      reply: 'line 1\nline 2 of a long review',
      settled: true,
      source: 'ask-back'
    })
    // Nothing was typed into the waiting caller's terminal.
    expect(calls.filter((call) => call === 'send:term_a')).toEqual([])
  })

  it('prompts normally when no ask is waiting', async () => {
    const { runtime, calls } = fakeRuntime()
    await askConnectedPeer({
      snapshot: snapshotWith(true),
      runtime,
      callerSessionId: 'tab-b',
      target: 'Alpha',
      prompt: 'hi'
    })
    expect(calls).toContain('send:term_a')
  })
})
