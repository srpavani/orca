import { describe, expect, it } from 'vitest'
import { glideProgress } from './agent-canvas-camera'

describe('glideProgress', () => {
  it('rises monotonically to rest without overshoot, settling near 0.35s', () => {
    let previous = 0
    for (let ms = 0; ms <= 800; ms += 10) {
      const t = glideProgress(ms / 1000)
      expect(t).toBeGreaterThanOrEqual(previous)
      expect(t).toBeLessThanOrEqual(1)
      previous = t
    }
    expect(glideProgress(0)).toBe(0)
    expect(glideProgress(0.35)).toBeGreaterThan(0.98)
  })
})
