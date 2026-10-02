/**
 * Sonar — the canvas watch.
 *
 * A watched session is one the user wants to hear about: the host samples its
 * terminal, and when an agent that was producing output falls quiet, that is
 * either "finished" or "waiting for you", and it is worth one notification.
 *
 * The signal is deliberately the PTY's own output clock rather than an agent's
 * self-report: it needs no cooperation from the agent, works the same on macOS,
 * Windows and Linux, and cannot be spoofed by the thing being watched.
 */

/** No output for this long means the terminal has stopped working. */
export const SONAR_QUIET_MS = 20_000

export type SonarActivityState = 'working' | 'quiet' | 'gone'

export type SonarSample = {
  sessionId: string
  label: string
  connected: boolean
  lastOutputAt: number | null
}

export type SonarEntry = {
  state: SonarActivityState
  lastOutputAt: number | null
  /**
   * The output clock already reported to the user. Why keyed on this and not a
   * timestamp: an agent that finishes twice must notify twice, and one that is
   * merely still quiet must not notify again.
   */
  announcedFor: number | null
}

export type SonarReason = 'finished-or-waiting'

export type SonarNotification = {
  sessionId: string
  label: string
  reason: SonarReason
}

export type SonarNext = {
  entry: SonarEntry
  notify: SonarNotification | null
}

export function classifyActivity(
  sample: SonarSample,
  now: number,
  quietMs = SONAR_QUIET_MS
): SonarActivityState {
  if (!sample.connected) {
    return 'gone'
  }
  if (sample.lastOutputAt === null) {
    return 'quiet'
  }
  return now - sample.lastOutputAt < quietMs ? 'working' : 'quiet'
}

const UNSEEN: SonarEntry = { state: 'quiet', lastOutputAt: null, announcedFor: null }

/**
 * Advances one watched session's state and decides whether this transition
 * deserves the user's attention. Notifies only on a genuine working → quiet
 * edge for a session that produced output we have not announced yet, so a
 * terminal that is simply idle does not repeat itself forever.
 */
export function advanceSonar(
  previous: SonarEntry | undefined,
  sample: SonarSample,
  now: number,
  quietMs = SONAR_QUIET_MS
): SonarNext {
  const state = classifyActivity(sample, now, quietMs)
  const entry: SonarEntry = {
    state,
    lastOutputAt: sample.lastOutputAt,
    announcedFor: previous?.announcedFor ?? null
  }
  const wasWorking = (previous ?? UNSEEN).state === 'working'
  const producedOutput = sample.lastOutputAt !== null
  const unannounced = entry.announcedFor !== sample.lastOutputAt
  if (producedOutput && state === 'quiet' && wasWorking && unannounced) {
    entry.announcedFor = sample.lastOutputAt
    return {
      entry,
      notify: { sessionId: sample.sessionId, label: sample.label, reason: 'finished-or-waiting' }
    }
  }
  return { entry, notify: null }
}

/** Notification text. Says who and what, and points at the canvas. */
export function sonarMessage(notification: SonarNotification): { title: string; body: string } {
  return {
    title: `${notification.label} on the Agent Canvas`,
    body:
      notification.reason === 'finished-or-waiting'
        ? 'Stopped producing output — it may be done, or waiting on you.'
        : 'Needs attention.'
  }
}

export type SonarRow = {
  sessionId: string
  label: string
  state: SonarActivityState
  /** Milliseconds since the terminal last produced output; null when it never has. */
  quietForMs: number | null
}

/** The team board: what every watched session is doing right now. */
export function sonarBoard(
  samples: readonly SonarSample[],
  now: number,
  quietMs = SONAR_QUIET_MS
): SonarRow[] {
  return samples.map((sample) => ({
    sessionId: sample.sessionId,
    label: sample.label,
    state: classifyActivity(sample, now, quietMs),
    quietForMs: sample.lastOutputAt === null ? null : Math.max(0, now - sample.lastOutputAt)
  }))
}
