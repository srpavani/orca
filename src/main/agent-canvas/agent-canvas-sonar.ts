import { watchedSessions } from '../../shared/spatial-canvas/node-flags'
import {
  advanceSonar,
  type SonarEntry,
  type SonarNotification,
  type SonarSample
} from '../../shared/spatial-canvas/sonar'
import { sessionNode } from '../../shared/spatial-canvas/levels'
import type { AgentCanvasStore } from './agent-canvas-store'

export type SonarRuntime = {
  listTerminals(): Promise<{
    terminals: {
      handle: string
      tabId: string
      connected: boolean
      lastOutputAt: number | null
      agentIdentity?: string
    }[]
  }>
}

export type SonarDelivery = (notification: SonarNotification) => void

/** How often the watch samples the terminals. Cheap: one list call per tick. */
export const SONAR_POLL_MS = 5_000

/**
 * Sonar — watches the canvas and taps the user when a watched agent goes quiet.
 *
 * Sampling the PTY's output clock rather than asking the agent anything is what
 * makes it work on every platform and for agents that know nothing about Orca:
 * the signal is the terminal's own, and a silent agent cannot fake it.
 */
export class AgentCanvasSonar {
  private readonly entries = new Map<string, SonarEntry>()
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly store: AgentCanvasStore,
    private readonly runtime: SonarRuntime,
    private readonly deliver: SonarDelivery,
    private readonly now: () => number = Date.now,
    private readonly pollMs: number = SONAR_POLL_MS
  ) {}

  start(): void {
    if (this.timer !== null) {
      return
    }
    this.timer = setInterval(() => void this.tick(), this.pollMs)
    // Why unref: the watch must never be the reason Orca's process stays alive.
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.entries.clear()
  }

  /** One sampling pass. Returns what was reported, so tests can assert without timers. */
  async tick(): Promise<SonarNotification[]> {
    // Why single-flight: a slow list call must not overlap the next tick and
    // report the same quiet edge twice.
    if (this.running) {
      return []
    }
    this.running = true
    try {
      return await this.sample()
    } catch {
      // A host that is restarting or a terminal list that failed is not an event.
      return []
    } finally {
      this.running = false
    }
  }

  private async sample(): Promise<SonarNotification[]> {
    const watched = watchedSessions(this.store.get().document)
    if (watched.length === 0) {
      this.entries.clear()
      return []
    }
    const { terminals } = await this.runtime.listTerminals()
    const bySession = new Map(terminals.map((terminal) => [terminal.tabId, terminal]))
    const now = this.now()
    const reported: SonarNotification[] = []
    const seen = new Set<string>()
    for (const session of watched) {
      const terminal = bySession.get(session.sessionId)
      if (!terminal) {
        // A session whose worktree was never mounted has no PTY to watch; keep
        // its history so its first real output is judged against the right edge.
        continue
      }
      seen.add(session.sessionId)
      const label = labelFor(this.store, session.sessionId) ?? session.label
      const sample: SonarSample = {
        sessionId: session.sessionId,
        label,
        connected: terminal.connected,
        // Why gated on agent identity: a plain shell that runs one command and
        // goes quiet is not "waiting for you", and notifying for it is noise.
        lastOutputAt: terminal.agentIdentity ? terminal.lastOutputAt : null
      }
      const { entry, notify } = advanceSonar(this.entries.get(session.sessionId), sample, now)
      this.entries.set(session.sessionId, entry)
      if (notify) {
        reported.push(notify)
      }
    }
    for (const sessionId of this.entries.keys()) {
      if (!seen.has(sessionId)) {
        this.entries.delete(sessionId)
      }
    }
    for (const notification of reported) {
      this.deliver(notification)
    }
    return reported
  }
}

function labelFor(store: AgentCanvasStore, sessionId: string): string | null {
  const node = sessionNode(store.get().document, sessionId)
  return node !== null && node.content.kind === 'session' ? node.content.label : null
}
