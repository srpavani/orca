import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLevel } from '../../shared/spatial-canvas/level-edits'
import { levelIdOfNode, sessionNode } from '../../shared/spatial-canvas/levels'
import { ensureCallerPlaced, resolveCaller } from './agent-canvas-host'
import { viewPeers } from './agent-canvas-peers'
import { AgentCanvasStore } from './agent-canvas-store'

const dirs: string[] = []

function freshStore(): AgentCanvasStore {
  const dir = mkdtempSync(join(tmpdir(), 'orca-agent-canvas-first-'))
  dirs.push(dir)
  return new AgentCanvasStore(dir)
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const terminals = {
  terminals: [
    { handle: 'term_a', tabId: 'tab-a', title: 'Backend', worktreeId: 'wt-main', branch: 'main' },
    {
      handle: 'term_b',
      tabId: 'tab-b',
      title: 'Feature',
      worktreeId: 'wt-x',
      branch: 'refs/heads/feature/x'
    }
  ]
}
const list = async (): Promise<typeof terminals> => terminals

describe('first use without opening the canvas view', () => {
  it('resolves the caller with its title and branch, never trusting a spoofed tab id', async () => {
    await expect(
      resolveCaller({ callerTerminal: 'term_b', callerTabId: 'tab-a' }, list)
    ).resolves.toEqual({
      sessionId: 'tab-b',
      label: 'Feature',
      worktreeId: 'wt-x',
      branch: 'refs/heads/feature/x'
    })
  })

  it('places an unknown caller so `peers` works on an empty canvas, with no access granted', async () => {
    const store = freshStore()
    const caller = await resolveCaller({ callerTerminal: 'term_a' }, list)
    const snapshot = ensureCallerPlaced(store, caller)
    expect(viewPeers(snapshot, 'tab-a')).toMatchObject({
      self: { label: 'Backend' },
      sessions: [],
      notes: []
    })
    // Idempotent: a second call does not bump the revision.
    expect(ensureCallerPlaced(store, caller).revision).toBe(snapshot.revision)
  })

  it('places the caller on the floor pinned to its branch', async () => {
    const store = freshStore()
    let levelId = ''
    store.update((current) => {
      const created = createLevel(current.document, { name: 'feature/x', branch: 'feature/x' })
      levelId = created.levelId
      return { ...current, document: created.document }
    })
    const snapshot = ensureCallerPlaced(
      store,
      await resolveCaller({ callerTerminal: 'term_b' }, list)
    )
    const node = sessionNode(snapshot.document, 'tab-b')!
    expect(levelIdOfNode(snapshot.document, node.id)).toBe(levelId)
  })
})
