import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  emptyAgentCanvasSnapshot,
  parseAgentCanvasSnapshot,
  type AgentCanvasSnapshot
} from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { rebaseDocument } from '../../shared/spatial-canvas/document-rebase'
import type { CanvasDocument } from '../../shared/spatial-canvas/types'
import {
  hardenExistingSecureFile,
  isUnreadableError,
  writeSecureJsonFile
} from '../../shared/secure-file'

export const AGENT_CANVAS_FILENAME = 'agent-canvas.json'

type AgentCanvasListener = (snapshot: AgentCanvasSnapshot) => void

/**
 * The host-owned copy of the canvas. The renderer edits through RPC and agents
 * read through the CLI, so permission checks always see the same graph the user drew.
 */
export class AgentCanvasStore {
  private readonly path: string
  private snapshot: AgentCanvasSnapshot
  private readonly unreadable: boolean
  private readonly listeners = new Set<AgentCanvasListener>()

  /**
   * `path` defaults to the global board; `seed` supplies the starting snapshot when
   * the file does not exist yet.
   */
  constructor(
    userDataPath: string,
    options: { path?: string; seed?: () => AgentCanvasSnapshot } = {}
  ) {
    this.path = options.path ?? join(userDataPath, AGENT_CANVAS_FILENAME)
    let snapshot = emptyAgentCanvasSnapshot()
    let unreadable = false
    try {
      hardenExistingSecureFile(this.path)
      snapshot = parseAgentCanvasSnapshot(JSON.parse(readFileSync(this.path, 'utf8')))
    } catch (error) {
      // Why: an unreadable (not merely missing) file must never be overwritten by an empty canvas.
      unreadable = isUnreadableError(error)
      if (!unreadable && options.seed) {
        snapshot = options.seed()
      }
    }
    this.snapshot = snapshot
    this.unreadable = unreadable
  }

  get(): AgentCanvasSnapshot {
    return this.snapshot
  }

  /** Applies `update` and persists; returns the stored snapshot with its new revision. */
  update(update: (current: AgentCanvasSnapshot) => AgentCanvasSnapshot): AgentCanvasSnapshot {
    const next = { ...update(this.snapshot), revision: this.snapshot.revision + 1 }
    this.snapshot = next
    if (!this.unreadable) {
      writeSecureJsonFile(this.path, next)
    }
    for (const listener of this.listeners) {
      listener(next)
    }
    return next
  }

  /**
   * Applies what an operation changed between `before` and `after` over the board
   * as it is now. Why: recruit and replace await a terminal for seconds, and a
   * plain overwrite would erase every edit made to the board meanwhile.
   */
  applyDelta(before: CanvasDocument, after: CanvasDocument): AgentCanvasSnapshot {
    return this.update((current) => ({
      ...current,
      document: rebaseDocument(current.document, before, after)
    }))
  }

  subscribe(listener: AgentCanvasListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const PROJECT_CANVAS_DIRNAME = 'agent-canvas'

/** A filename that cannot escape the canvas directory, whatever the repo id holds. */
export function projectCanvasFilename(projectKey: string): string {
  const slug = projectKey.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)
  const digest = createHash('sha256').update(projectKey).digest('hex').slice(0, 12)
  return `${slug}-${digest}.json`
}

/**
 * One board per project (repository), like Maestri's workspaces. Boards live in
 * userData, never inside the repository, so drawing on the canvas cannot dirty
 * a checkout — and an SSH repo's board stays with the host that shows it.
 * A null key is the legacy global board.
 */
export class AgentCanvasBoards {
  private readonly global: AgentCanvasStore
  private readonly boards = new Map<string, AgentCanvasStore>()

  constructor(private readonly userDataPath: string) {
    this.global = new AgentCanvasStore(userDataPath)
  }

  board(projectKey: string | null | undefined): AgentCanvasStore {
    if (!projectKey) {
      return this.global
    }
    let board = this.boards.get(projectKey)
    if (!board) {
      board = new AgentCanvasStore(this.userDataPath, {
        path: join(this.userDataPath, PROJECT_CANVAS_DIRNAME, projectCanvasFilename(projectKey)),
        // Why seed from the global board: before boards were per project everything
        // lived there, and a project must not open to an empty canvas after upgrading.
        seed: () => ({ ...this.global.get(), revision: 0 })
      })
      this.boards.set(projectKey, board)
    }
    return board
  }
}
