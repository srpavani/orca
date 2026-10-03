import { describe, expect, it } from 'vitest'
import {
  createFloorScrollSwitch,
  nextFloorIndex,
  normalizeWheelSample
} from './floor-scroll-switch'

describe('normalizeWheelSample', () => {
  it('treats small pixel deltas as a trackpad and big ones as a wheel notch', () => {
    expect(normalizeWheelSample({ deltaY: 12, deltaMode: 0 })).toEqual({ delta: 12, threshold: 50 })
    expect(normalizeWheelSample({ deltaY: 100, deltaMode: 0 })).toEqual({ delta: 3, threshold: 3 })
    expect(normalizeWheelSample({ deltaY: -3, deltaMode: 1 })).toEqual({ delta: -3, threshold: 3 })
  })
})

describe('createFloorScrollSwitch', () => {
  it('steps once per gesture, however many events it fires', () => {
    let t = 0
    const sw = createFloorScrollSwitch(() => t)
    const steps = [100, 100, 100].map((deltaY) => {
      t += 16
      return sw.handle({ deltaY, deltaMode: 0 })
    })
    expect(steps).toEqual([-1, null, null])
  })

  it('scrolling up goes up the stack, and a pause starts a new gesture', () => {
    let t = 0
    const sw = createFloorScrollSwitch(() => t)
    expect(sw.handle({ deltaY: -100, deltaMode: 0 })).toBe(1)
    t += 400
    expect(sw.handle({ deltaY: -100, deltaMode: 0 })).toBe(1)
  })

  it('a trackpad must travel 50px before it counts', () => {
    let t = 0
    const sw = createFloorScrollSwitch(() => t)
    const results = [20, 20, 20].map((deltaY) => {
      t += 16
      return sw.handle({ deltaY, deltaMode: 0 })
    })
    expect(results).toEqual([null, null, -1])
  })
})

describe('nextFloorIndex', () => {
  it('holds at the ends of the stack', () => {
    expect(nextFloorIndex(0, -1, 3)).toBe(0)
    expect(nextFloorIndex(2, 1, 3)).toBe(2)
    expect(nextFloorIndex(1, 1, 3)).toBe(2)
  })
})
