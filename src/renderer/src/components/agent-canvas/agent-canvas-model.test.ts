import { describe, expect, it } from 'vitest'
import { connectNodes, createDocument } from '../../../../shared/spatial-canvas/document'
import { everyEdge, everyNode } from '../../../../shared/spatial-canvas/levels'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import {
  emptyAgentCanvasSnapshot as emptyAgentCanvas,
  parseAgentCanvasSnapshot
} from '../../../../shared/spatial-canvas/agent-canvas-snapshot'

function parsePersistedAgentCanvas(raw: string | null) {
  let value: unknown = null
  try {
    value = raw === null ? null : JSON.parse(raw)
  } catch {
    value = null
  }
  return parseAgentCanvasSnapshot(value)
}
const serializeAgentCanvas = (value: unknown): string => JSON.stringify(value)
import { ropeBetween } from './agent-canvas-rope'
import { gridSlot, liveSessionsFromTabs, syncSessionNodes } from './agent-canvas-sessions'

function sequentialIds(): () => string {
  let next = 0
  return () => {
    next += 1
    return `id-${next}`
  }
}

function tab(id: string, title: string, customTitle: string | null = null): TerminalTab {
  return {
    id,
    ptyId: null,
    worktreeId: 'wt',
    title,
    customTitle,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}

describe('liveSessionsFromTabs', () => {
  it('flattens every worktree and prefers the custom title', () => {
    const sessions = liveSessionsFromTabs(
      {
        'wt-a': [tab('t1', 'zsh', 'Backend')],
        'wt-b': [tab('t2', 'claude')]
      },
      new Map([['wt-b', 'feature/x']])
    )
    expect(sessions).toEqual([
      { sessionId: 't1', label: 'Backend', worktreeId: 'wt-a', branch: null },
      { sessionId: 't2', label: 'claude', worktreeId: 'wt-b', branch: 'feature/x' }
    ])
  })
})

describe('syncSessionNodes', () => {
  const sessions = [
    { sessionId: 's1', label: 'One', worktreeId: 'wt' },
    { sessionId: 's2', label: 'Two', worktreeId: 'wt' }
  ]

  it('places unseen sessions on distinct grid slots', () => {
    const document = syncSessionNodes(createDocument(), sessions, sequentialIds())
    const frames = everyNode(document).map((node) => ({ x: node.frame.x, y: node.frame.y }))
    expect(frames).toEqual([gridSlot(0), gridSlot(1)])
  })

  it('is idempotent and follows renamed tabs', () => {
    const ids = sequentialIds()
    const once = syncSessionNodes(createDocument(), sessions, ids)
    const twice = syncSessionNodes(once, sessions, ids)
    expect(twice).toBe(once)
    const renamed = syncSessionNodes(once, [{ ...sessions[0], label: 'Renamed' }, sessions[1]], ids)
    const labels = everyNode(renamed).map((node) =>
      node.content.kind === 'session' ? node.content.label : ''
    )
    expect(labels).toEqual(['Renamed', 'Two'])
  })

  it('keeps nodes and wires for sessions that are not live yet', () => {
    const ids = sequentialIds()
    const placed = syncSessionNodes(createDocument(), sessions, ids)
    const [a, b] = everyNode(placed)
    const wired = connectNodes(placed, a.id, b.id, 'now', ids)
    expect(wired).not.toBeNull()
    const afterHydration = syncSessionNodes(wired!.document, [], ids)
    expect(everyNode(afterHydration)).toHaveLength(2)
    expect(everyEdge(afterHydration)).toHaveLength(1)
  })
})

describe('agent canvas persistence', () => {
  it('round-trips a canvas', () => {
    const canvas = emptyAgentCanvas()
    canvas.notes['n1'] = 'hello'
    canvas.viewport = { origin: { x: 1, y: 2 }, zoom: 1.5 }
    expect(parsePersistedAgentCanvas(serializeAgentCanvas(canvas))).toEqual(canvas)
  })

  it.each([null, '', '{', '[]', '{"document":{"version":999}}', '{"document":null}'])(
    'falls back to an empty canvas for %j',
    (raw) => {
      expect(parsePersistedAgentCanvas(raw)).toEqual(emptyAgentCanvas())
    }
  )

  it('clamps an out-of-range zoom and drops non-string notes', () => {
    const raw = JSON.stringify({
      ...emptyAgentCanvas(),
      viewport: { origin: { x: 0, y: 0 }, zoom: 99 },
      notes: { ok: 'x', bad: 3 }
    })
    const parsed = parsePersistedAgentCanvas(raw)
    expect(parsed.viewport.zoom).toBe(3)
    expect(parsed.notes).toEqual({ ok: 'x' })
  })
})

describe('ropeBetween', () => {
  it('leaves the facing sides horizontally', () => {
    const rope = ropeBetween(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 300, y: 0, width: 100, height: 50 }
    )
    expect(rope.d.startsWith('M 100 25 ')).toBe(true)
    expect(rope.d.endsWith(', 300 25')).toBe(true)
    expect(rope.mid).toEqual({ x: 200, y: 25 })
  })

  it('switches to vertical when the nodes are stacked', () => {
    const rope = ropeBetween(
      { x: 0, y: 300, width: 100, height: 50 },
      { x: 0, y: 0, width: 100, height: 50 }
    )
    expect(rope.d.startsWith('M 50 300 ')).toBe(true)
    expect(rope.d.endsWith(', 50 50')).toBe(true)
  })
})
