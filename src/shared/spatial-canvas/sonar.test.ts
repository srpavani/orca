import { describe, expect, it } from 'vitest'
import {
  SONAR_QUIET_MS,
  advanceSonar,
  classifyActivity,
  sonarBoard,
  sonarMessage,
  type SonarEntry,
  type SonarSample
} from './sonar'

const NOW = 1_000_000

function sample(overrides: Partial<SonarSample> = {}): SonarSample {
  return {
    sessionId: 's',
    label: 'Scout',
    connected: true,
    lastOutputAt: NOW - 1_000,
    ...overrides
  }
}

describe('classifyActivity', () => {
  it('is working while output is recent, quiet after the threshold, gone when disconnected', () => {
    expect(classifyActivity(sample(), NOW)).toBe('working')
    expect(classifyActivity(sample({ lastOutputAt: NOW - SONAR_QUIET_MS }), NOW)).toBe('quiet')
    expect(classifyActivity(sample({ connected: false }), NOW)).toBe('gone')
    expect(classifyActivity(sample({ lastOutputAt: null }), NOW)).toBe('quiet')
  })
})

describe('advanceSonar', () => {
  it('notifies once when a working session falls quiet', () => {
    const working = advanceSonar(undefined, sample(), NOW)
    expect(working.notify).toBeNull()
    expect(working.entry.state).toBe('working')

    const quietSample = sample({ lastOutputAt: NOW - SONAR_QUIET_MS - 1 })
    const first = advanceSonar(working.entry, quietSample, NOW)
    expect(first.notify).toMatchObject({ sessionId: 's', reason: 'finished-or-waiting' })
    expect(first.entry.state).toBe('quiet')

    // Still quiet: no second notification for the same output.
    expect(advanceSonar(first.entry, quietSample, NOW + 5_000).notify).toBeNull()
  })

  it('stays silent for a session that was never seen working', () => {
    const idle: SonarEntry = { state: 'quiet', lastOutputAt: null, announcedFor: null }
    expect(advanceSonar(idle, sample({ lastOutputAt: NOW - 60_000 }), NOW).notify).toBeNull()
    expect(advanceSonar(undefined, sample({ lastOutputAt: NOW - 60_000 }), NOW).notify).toBeNull()
  })

  it('notifies again after a second burst of work', () => {
    const first = advanceSonar(
      advanceSonar(undefined, sample(), NOW).entry,
      sample({ lastOutputAt: NOW - SONAR_QUIET_MS - 1 }),
      NOW
    )
    expect(first.notify).not.toBeNull()
    // The agent takes new work, then finishes again.
    const working = advanceSonar(first.entry, sample({ lastOutputAt: NOW + 60_000 }), NOW + 60_000)
    expect(working.entry.state).toBe('working')
    const second = advanceSonar(
      working.entry,
      sample({ lastOutputAt: NOW + 60_000 }),
      NOW + 60_000 + SONAR_QUIET_MS + 1
    )
    expect(second.notify).not.toBeNull()
  })

  it('does not notify for a session that never produced output, and survives going away', () => {
    const quiet = advanceSonar(undefined, sample({ lastOutputAt: null }), NOW)
    expect(quiet.notify).toBeNull()
    const gone = advanceSonar(quiet.entry, sample({ connected: false }), NOW)
    expect(gone.entry.state).toBe('gone')
    expect(gone.notify).toBeNull()
  })

  it('ignores output produced while disconnected', () => {
    const working = advanceSonar(undefined, sample(), NOW)
    const gone = advanceSonar(working.entry, sample({ connected: false, lastOutputAt: NOW }), NOW)
    expect(gone.notify).toBeNull()
  })
})

describe('sonarBoard wording', () => {
  it('reports quiet time per session', () => {
    expect(
      sonarBoard([sample(), sample({ sessionId: 'b', label: 'B', lastOutputAt: null })], NOW)
    ).toEqual([
      { sessionId: 's', label: 'Scout', state: 'working', quietForMs: 1_000 },
      { sessionId: 'b', label: 'B', state: 'quiet', quietForMs: null }
    ])
  })

  it('names the session in the notification', () => {
    expect(sonarMessage({ sessionId: 's', label: 'Scout', reason: 'finished-or-waiting' })).toEqual(
      {
        title: 'Scout on the Agent Canvas',
        body: 'Stopped producing output — it may be done, or waiting on you.'
      }
    )
  })
})
