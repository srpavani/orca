import { describe, expect, it, vi } from 'vitest'
import { addNode, createDocument, createSessionNode } from '../../shared/spatial-canvas/document'
import { createLevel } from '../../shared/spatial-canvas/level-edits'
import { levelIdOfNode, sessionNode } from '../../shared/spatial-canvas/levels'
import { canReach } from '../../shared/spatial-canvas/reachability'
import { emptyAgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { recruitAgent, type AgentCanvasRecruitRuntime } from './agent-canvas-recruit'

const AT = { x: 0, y: 0 }

function snapshots(): {
  snapshot: ReturnType<typeof emptyAgentCanvasSnapshot>
  callerWorktreeId: string
} {
  const caller = createSessionNode({ sessionId: 'lead', label: 'Lead', at: AT })
  const base = emptyAgentCanvasSnapshot()
  return {
    snapshot: { ...base, document: addNode(createDocument(), caller) },
    callerWorktreeId: 'wt-1'
  }
}

function fakeRuntime(overrides: Partial<AgentCanvasRecruitRuntime> = {}): {
  runtime: AgentCanvasRecruitRuntime
  spawn: ReturnType<typeof vi.fn>
} {
  const spawn = vi.fn(async () => ({ tab: { terminal: 'term_new' } }))
  const runtime: AgentCanvasRecruitRuntime = {
    createMobileSessionTerminal: spawn,
    listTerminals: async () => ({
      terminals: [{ handle: 'term_new', tabId: 'tab-new', connected: true, worktreeId: 'wt-1' }]
    }),
    ...overrides
  }
  return { runtime, spawn }
}

async function recruit(
  input: { name?: string; floor?: string; agent?: string } = {}
): Promise<Awaited<ReturnType<typeof recruitAgent>>> {
  const { snapshot, callerWorktreeId } = snapshots()
  const { runtime } = fakeRuntime()
  return recruitAgent({
    snapshot,
    runtime,
    callerSessionId: 'lead',
    callerWorktreeId,
    name: input.name ?? 'Aurora',
    ...(input.floor === undefined ? {} : { floor: input.floor }),
    ...(input.agent === undefined ? {} : { agent: input.agent })
  })
}

describe('recruitAgent', () => {
  it('spawns in the caller workspace and returns a canvas wired to the caller', async () => {
    const result = await recruit()
    expect(result).toMatchObject({
      sessionId: 'tab-new',
      label: 'Aurora',
      handle: 'term_new',
      bridged: false
    })
    expect(canReach(result.document, 'lead', 'tab-new')).toBe(true)
    expect(sessionNode(result.document, 'tab-new')?.content).toMatchObject({
      label: 'Aurora',
      name: 'Aurora'
    })
  })

  it('creates the terminal in the caller terminal workspace selector', async () => {
    const { snapshot, callerWorktreeId } = snapshots()
    const { runtime, spawn } = fakeRuntime()
    await recruitAgent({
      snapshot,
      runtime,
      callerSessionId: 'lead',
      callerWorktreeId,
      name: 'Aurora',
      agent: 'claude',
      prompt: 'map the flow'
    })
    expect(spawn).toHaveBeenCalledWith(
      'id:wt-1',
      expect.objectContaining({ activate: false, select: false })
    )
  })

  it('refuses a taken name before spawning anything', async () => {
    const { snapshot, callerWorktreeId } = snapshots()
    const { runtime, spawn } = fakeRuntime()
    await expect(
      recruitAgent({
        snapshot,
        runtime,
        callerSessionId: 'lead',
        callerWorktreeId,
        name: 'Lead'
      })
    ).rejects.toMatchObject({ code: 'canvas_label_taken' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('refuses an unknown floor and an unknown agent preset', async () => {
    await expect(recruit({ floor: 'Nope' })).rejects.toMatchObject({
      code: 'canvas_floor_not_found'
    })
    await expect(recruit({ agent: 'not-an-agent' })).rejects.toMatchObject({
      code: 'canvas_recruit_failed'
    })
  })

  it('places the recruit on a named floor and bridges it to the caller', async () => {
    const caller = createSessionNode({ sessionId: 'lead', label: 'Lead', at: AT })
    const base = emptyAgentCanvasSnapshot()
    const level = createLevel(addNode(createDocument(), caller), { name: 'Experiment' })
    const { runtime } = fakeRuntime()
    const result = await recruitAgent({
      snapshot: { ...base, document: level.document },
      runtime,
      callerSessionId: 'lead',
      callerWorktreeId: 'wt-1',
      name: 'Probe',
      floor: ' experiment '
    })
    const node = sessionNode(result.document, 'tab-new')!
    expect(result.bridged).toBe(true)
    expect(levelIdOfNode(result.document, node.id)).toBe(level.levelId)
    expect(canReach(result.document, 'lead', 'tab-new')).toBe(true)
  })

  it('fails when the spawn never yields a connected terminal', async () => {
    vi.useFakeTimers()
    try {
      const { snapshot, callerWorktreeId } = snapshots()
      const { runtime } = fakeRuntime({ listTerminals: async () => ({ terminals: [] }) })
      const pending = recruitAgent({
        snapshot,
        runtime,
        callerSessionId: 'lead',
        callerWorktreeId,
        name: 'Aurora'
      })
      const assertion = expect(pending).rejects.toMatchObject({ code: 'canvas_recruit_failed' })
      await vi.advanceTimersByTimeAsync(21_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
