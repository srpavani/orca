import { describe, expect, it } from 'vitest'
import {
  frameCenteredAt,
  frameFromDrag,
  snapRectOutward,
  textFrameFromDrag
} from './creation-frame'

describe('creation frame (reference useCreationGesture)', () => {
  it('a click centres the default size on the press, on the grid', () => {
    expect(
      frameFromDrag({ x: 105, y: 97 }, { x: 110, y: 100 }, { width: 260, height: 220 })
    ).toEqual({ x: -20, y: -20, width: 260, height: 220 })
  })

  it('a drag of 24px or more spans the box, snapped outward', () => {
    expect(frameFromDrag({ x: 13, y: 7 }, { x: 101, y: 59 }, { width: 260, height: 220 })).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 60
    })
  })

  it('snaps outward whichever corner the drag started from', () => {
    expect(snapRectOutward({ x: 101, y: 59 }, { x: 13, y: 7 })).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 60
    })
  })

  it('never makes a frame smaller than one grid step', () => {
    const frame = frameCenteredAt({ x: 100, y: 100 }, { width: 3, height: 3 })
    // snapToGrid(100 - 10) rounds 4.5 cells up to 100, as the reference's Math.round does.
    expect(frame).toEqual({ x: 100, y: 100, width: 20, height: 20 })
  })

  it('a text click anchors the top-left on the press at 200x36', () => {
    expect(textFrameFromDrag({ x: 33, y: 41 }, { x: 34, y: 41 })).toEqual({
      x: 33,
      y: 41,
      width: 200,
      height: 36
    })
  })
})
