/**
 * The reference's wheel-to-floor switch (createWorkspaceScrollSwitch,
 * normalizeWheelSample): in the floor overview one wheel gesture moves one
 * floor, however many events the gesture fires. A trackpad needs 50px of
 * travel, a mouse wheel one notch; the gesture ends after 300ms of quiet.
 */

export const IDLE_TIMEOUT_MS = 300
const PRECISE_THRESHOLD = 50
const DISCRETE_THRESHOLD = 3
const PIXEL_WHEEL_NOTCH = 40
const DOM_DELTA_PIXEL = 0
const DOM_DELTA_LINE = 1

type WheelSample = { deltaY: number; deltaMode: number }

export function normalizeWheelSample(event: WheelSample): { delta: number; threshold: number } {
  if (event.deltaMode === DOM_DELTA_PIXEL && Math.abs(event.deltaY) < PIXEL_WHEEL_NOTCH) {
    return { delta: event.deltaY, threshold: PRECISE_THRESHOLD }
  }
  if (event.deltaMode === DOM_DELTA_LINE) {
    return { delta: event.deltaY, threshold: DISCRETE_THRESHOLD }
  }
  return { delta: Math.sign(event.deltaY) * DISCRETE_THRESHOLD, threshold: DISCRETE_THRESHOLD }
}

/** Steps up the stack (+1) when scrolled up, down (-1) when scrolled down, once per gesture. */
export function createFloorScrollSwitch(now: () => number): {
  handle: (event: WheelSample) => 1 | -1 | null
} {
  let accumulator = 0
  let consumed = false
  let lastEventAt = Number.NEGATIVE_INFINITY
  return {
    handle: (event) => {
      const sample = normalizeWheelSample(event)
      if (sample.delta === 0) {
        return null
      }
      const at = now()
      if (at - lastEventAt > IDLE_TIMEOUT_MS) {
        accumulator = 0
        consumed = false
      }
      lastEventAt = at
      if (consumed) {
        return null
      }
      accumulator += sample.delta
      if (Math.abs(accumulator) < sample.threshold) {
        return null
      }
      consumed = true
      return accumulator < 0 ? 1 : -1
    }
  }
}

/** The floor `delta` steps away, held at the ends of the stack. */
export function nextFloorIndex(activeIndex: number, delta: number, stopCount: number): number {
  if (stopCount <= 0) {
    return 0
  }
  return Math.min(stopCount - 1, Math.max(0, activeIndex + delta))
}
