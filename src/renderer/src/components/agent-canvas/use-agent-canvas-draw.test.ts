import { describe, expect, it } from 'vitest'
import { shapeFromDrag } from './use-agent-canvas-draw'

describe('shapeFromDrag', () => {
  it('normalizes a box dragged up-left to a positive size at the top-left corner', () => {
    expect(shapeFromDrag('rect', { x: 100, y: 80 }, { x: 40, y: 20 }, [])).toEqual({
      origin: { x: 40, y: 20 },
      shape: { type: 'rect', width: 60, height: 60, cornerRadius: 6 }
    })
  })

  it('keeps arrow direction relative to its bounding origin', () => {
    expect(shapeFromDrag('arrow', { x: 50, y: 10 }, { x: 10, y: 30 }, [])).toEqual({
      origin: { x: 10, y: 10 },
      shape: { type: 'arrow', from: { x: 40, y: 0 }, to: { x: 0, y: 20 } }
    })
  })

  it('stores freehand points relative to the stroke bounds', () => {
    const trail = [
      { x: 5, y: 9 },
      { x: 3, y: 12 },
      { x: 8, y: 7 }
    ]
    expect(shapeFromDrag('freehand', trail[0], trail[2], trail)).toEqual({
      origin: { x: 3, y: 7 },
      shape: {
        type: 'freehand',
        points: [
          { x: 2, y: 2 },
          { x: 0, y: 5 },
          { x: 5, y: 0 }
        ]
      }
    })
  })
})
