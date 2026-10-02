import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  emptyAgentCanvasSnapshot,
  parseAgentCanvasSnapshot,
  type AgentCanvasSnapshot
} from '../../shared/spatial-canvas/agent-canvas-snapshot'
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

  constructor(userDataPath: string) {
    this.path = join(userDataPath, AGENT_CANVAS_FILENAME)
    let snapshot = emptyAgentCanvasSnapshot()
    let unreadable = false
    try {
      hardenExistingSecureFile(this.path)
      snapshot = parseAgentCanvasSnapshot(JSON.parse(readFileSync(this.path, 'utf8')))
    } catch (error) {
      // Why: an unreadable (not merely missing) file must never be overwritten by an empty canvas.
      unreadable = isUnreadableError(error)
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

  subscribe(listener: AgentCanvasListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
