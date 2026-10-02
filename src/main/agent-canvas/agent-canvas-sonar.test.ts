import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addNode, createDocument, createSessionNode } from '../../shared/spatial-canvas/document'
import { patchSessionFlags } from '../../shared/spatial-canvas/node-flags'
import { SONAR_QUIET_MS } from '../../shared/spatial-canvas/sonar'
import { AgentCanvasStore } from './agent-canvas-store'
import { AgentCanvasSonar, type SonarRuntime } from './agent-canvas-sonar'

const dirs: string[] = []
const NOW = 1_000_000

function store(): AgentCanvasStore {
  const dir = mkdtempSync(join(tmpdir(), 'orca-sonar-'))
  dirs.push(dir)
  return new AgentCanvasStore(dir)
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function withSessions(watchedScout = true): AgentCanvasStore {
  const canvas = store()
  const withLead = addNode(
    createDocument(),
    createSessionNode({ sessionId: 'lead', label: 'Lead', at: { x: 0, y: 0 } })
  )
  canvas.update((current) => ({
    ...current,
    document: addNode(
      withLead,
      createSessionNode({ sessionId: 'scout', label: 'Scout', at: { x: 0, y: 0 } })
    )
  }))
  if (!watchedScout) {
    const scout = canvas
      .get()
      .document.root.nodes.find(
        (node) => node.content.kind === 'session' && node.content.sessionId === 'scout'
      )
    canvas.update((current) => ({
      ...current,
      document: patchSessionFlags(current.document, scout!.id, { watched: false })
    }))
  }
  return canvas
}

function runtime(
  rows: { tabId: string; connected: boolean; lastOutputAt: number | null; agentIdentity?: string }[]
): SonarRuntime {
  return {
    listTerminals: vi.fn(async () => ({
      terminals: rows.map((row) => ({ handle: `h-${row.tabId}`, ...row }))
    }))
  }
}

describe('AgentCanvasSonar', () => {
  it('notifies once when a watched agent stops producing output', async () => {
    const canvas = withSessions()
    const delivered: string[] = []
    const terminal = {
      tabId: 'scout',
      connected: true,
      lastOutputAt: NOW - 1_000,
      agentIdentity: 'claude'
    }
    const sonar = new AgentCanvasSonar(
      canvas,
      runtime([terminal]),
      (notification) => delivered.push(notification.label),
      () => NOW
    )
    expect(await sonar.tick()).toEqual([])
    terminal.lastOutputAt = NOW - SONAR_QUIET_MS - 1
    const reported = await sonar.tick()
    expect(reported).toHaveLength(1)
    expect(delivered).toEqual(['Scout'])
    expect(await sonar.tick()).toEqual([])
  })

  it('stays silent for a muted card and for a plain shell', async () => {
    const muted = new AgentCanvasSonar(
      withSessions(false),
      runtime([
        { tabId: 'scout', connected: true, lastOutputAt: NOW - 1_000, agentIdentity: 'claude' }
      ]),
      () => {
        throw new Error('must not notify')
      },
      () => NOW
    )
    expect(await muted.tick()).toEqual([])

    const shell = new AgentCanvasSonar(
      withSessions(),
      runtime([{ tabId: 'scout', connected: true, lastOutputAt: NOW - 1_000 }]),
      () => {
        throw new Error('must not notify')
      },
      () => NOW
    )
    expect(await shell.tick()).toEqual([])
  })

  it('survives an unlisted session and a failing runtime', async () => {
    const sonar = new AgentCanvasSonar(
      withSessions(),
      runtime([]),
      () => {},
      () => NOW
    )
    expect(await sonar.tick()).toEqual([])

    const failing = new AgentCanvasSonar(
      withSessions(),
      {
        listTerminals: async () => {
          throw new Error('host restarting')
        }
      },
      () => {},
      () => NOW
    )
    await expect(failing.tick()).resolves.toEqual([])
  })

  it('reports nothing when the canvas has no sessions left', async () => {
    const empty = store()
    const sonar = new AgentCanvasSonar(
      empty,
      runtime([]),
      () => {},
      () => NOW
    )
    expect(await sonar.tick()).toEqual([])
  })
})

describe('AgentCanvasSonar lifecycle', () => {
  it('starts once and stops cleanly', () => {
    vi.useFakeTimers()
    try {
      const sonar = new AgentCanvasSonar(
        withSessions(),
        runtime([]),
        () => {},
        () => NOW,
        10
      )
      sonar.start()
      const afterFirstStart = vi.getTimerCount()
      sonar.start()
      // Why relative: other machinery in the store may hold timers of its own; what
      // start() must guarantee is that a second call adds nothing.
      expect(vi.getTimerCount()).toBe(afterFirstStart)
      sonar.stop()
      expect(vi.getTimerCount()).toBeLessThan(afterFirstStart)
    } finally {
      vi.useRealTimers()
    }
  })
})
