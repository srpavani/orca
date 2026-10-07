import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDocument } from '../../shared/spatial-canvas/document'
import {
  AGENT_CANVAS_FILENAME,
  AgentCanvasBoards,
  AgentCanvasStore,
  PROJECT_CANVAS_DIRNAME,
  projectCanvasFilename
} from './agent-canvas-store'
import {
  canvasProjectKeyOf,
  resolveCallerSessionId,
  saveCanvasFromClient
} from './agent-canvas-host'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-agent-canvas-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const viewport = { origin: { x: 1, y: 2 }, zoom: 1 }

describe('AgentCanvasStore', () => {
  it('persists across instances and bumps the revision', () => {
    const dir = tempDir()
    const first = new AgentCanvasStore(dir)
    const result = saveCanvasFromClient(first, {
      baseRevision: 0,
      document: createDocument(),
      viewport,
      notes: { n1: 'hello' }
    })
    expect(result.accepted).toBe(true)
    const reloaded = new AgentCanvasStore(dir).get()
    expect(reloaded.revision).toBe(1)
    expect(reloaded.notes).toEqual({ n1: 'hello' })
    expect(reloaded.viewport).toEqual(viewport)
  })

  it('refuses a save built on a stale revision', () => {
    const store = new AgentCanvasStore(tempDir())
    store.update((current) => ({ ...current, notes: { agent: 'wrote this' } }))
    const result = saveCanvasFromClient(store, {
      baseRevision: 0,
      document: createDocument(),
      viewport,
      notes: {}
    })
    expect(result).toMatchObject({ accepted: false, reason: 'stale' })
    expect(store.get().notes).toEqual({ agent: 'wrote this' })
  })

  it('refuses an invalid document without touching the stored one', () => {
    const store = new AgentCanvasStore(tempDir())
    const result = saveCanvasFromClient(store, {
      baseRevision: 0,
      document: { version: 999 },
      viewport,
      notes: {}
    })
    expect(result).toMatchObject({ accepted: false, reason: 'invalid' })
    expect(store.get().revision).toBe(0)
  })

  it('falls back to an empty canvas for a corrupt file and still writes', () => {
    const dir = tempDir()
    writeFileSync(join(dir, AGENT_CANVAS_FILENAME), '{ not json')
    const store = new AgentCanvasStore(dir)
    expect(store.get().revision).toBe(0)
    store.update((current) => current)
    expect(JSON.parse(readFileSync(join(dir, AGENT_CANVAS_FILENAME), 'utf8')).revision).toBe(1)
  })

  it('notifies subscribers with the new snapshot', () => {
    const store = new AgentCanvasStore(tempDir())
    const seen: number[] = []
    const unsubscribe = store.subscribe((snapshot) => seen.push(snapshot.revision))
    store.update((current) => current)
    unsubscribe()
    store.update((current) => current)
    expect(seen).toEqual([1])
  })
})

describe('AgentCanvasBoards', () => {
  it('keeps each project on its own board, outside the repository', () => {
    const dir = tempDir()
    const boards = new AgentCanvasBoards(dir)
    boards.board('repo-a').update((current) => ({ ...current, notes: { a: 'only a' } }))
    expect(boards.board('repo-b').get().notes).toEqual({})
    expect(boards.board(null).get().notes).toEqual({})
    const saved = JSON.parse(
      readFileSync(join(dir, PROJECT_CANVAS_DIRNAME, projectCanvasFilename('repo-a')), 'utf8')
    )
    expect(saved.notes).toEqual({ a: 'only a' })
    expect(new AgentCanvasBoards(dir).board('repo-a').get().notes).toEqual({ a: 'only a' })
  })

  it('opens a new project on a copy of the legacy global board', () => {
    const dir = tempDir()
    new AgentCanvasStore(dir).update((current) => ({ ...current, notes: { old: 'kept' } }))
    const board = new AgentCanvasBoards(dir).board('repo-a')
    expect(board.get()).toMatchObject({ notes: { old: 'kept' }, revision: 0 })
  })

  it('never lets a project key escape the canvas directory', () => {
    const name = projectCanvasFilename('../../etc/passwd')
    expect(name).not.toMatch(/[/\\]/)
    expect(name).not.toBe(projectCanvasFilename('.._.._etc_passwd'))
  })

  it("resolves an agent's project from its terminal's worktree", () => {
    expect(canvasProjectKeyOf({ worktreeId: 'repo-a::/work/repo-a' })).toBe('repo-a')
    expect(canvasProjectKeyOf({ worktreeId: '' })).toBeNull()
  })
})

describe('resolveCallerSessionId', () => {
  const list = async () => ({ terminals: [{ handle: 'term_x', tabId: 'tab-x' }] })

  it('prefers the host-resolved terminal handle', async () => {
    await expect(
      resolveCallerSessionId({ callerTerminal: 'term_x', callerTabId: 'spoof' }, list)
    ).resolves.toBe('tab-x')
  })

  it('falls back to the tab id and fails without either', async () => {
    await expect(resolveCallerSessionId({ callerTabId: 'tab-y' }, list)).resolves.toBe('tab-y')
    await expect(resolveCallerSessionId({}, list)).rejects.toMatchObject({
      code: 'canvas_caller_not_on_canvas'
    })
  })
})
