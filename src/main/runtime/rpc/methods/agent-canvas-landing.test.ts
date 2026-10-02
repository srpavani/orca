import { describe, expect, it, vi } from 'vitest'
import { deliverResolvePrompt } from './agent-canvas-landing'

function fakeRuntime(terminals: { handle: string; tabId: string; connected: boolean }[]) {
  return {
    listTerminals: vi.fn(async () => ({ terminals })),
    sendTerminalAgentPrompt: vi.fn(async () => ({}))
  }
}

describe('deliverResolvePrompt', () => {
  it('sends the prompt to the running terminal of that session', async () => {
    const runtime = fakeRuntime([
      { handle: 'h-other', tabId: 's2', connected: true },
      { handle: 'h-agent', tabId: 's1', connected: true }
    ])
    const result = await deliverResolvePrompt(runtime, 's1', 'CONFLICT: a.txt')
    expect(result).toEqual({ delivered: true, handle: 'h-agent' })
    expect(runtime.sendTerminalAgentPrompt).toHaveBeenCalledWith('h-agent', 'CONFLICT: a.txt', {
      inputKind: 'driving',
      acceptQueued: true,
      observationTimeoutMs: 0
    })
  })

  it('refuses a session whose terminal is not running', async () => {
    const runtime = fakeRuntime([{ handle: 'h', tabId: 's1', connected: false }])
    await expect(deliverResolvePrompt(runtime, 's1', 'x')).rejects.toThrow(/not running/)
    expect(runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })
})
