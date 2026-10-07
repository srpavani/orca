import { describe, expect, it } from 'vitest'
import { activeTransferEdgeIds, withTransfer } from './agent-canvas-transfers'

describe('withTransfer', () => {
  it('lights the wires while the work runs and for the minimum after', async () => {
    let clock = 1000
    let seenDuring: string[] = []
    await withTransfer(
      ['e1'],
      async () => {
        seenDuring = activeTransferEdgeIds(clock)
        clock += 100
      },
      () => clock
    )
    expect(seenDuring).toEqual(['e1'])
    expect(activeTransferEdgeIds(clock)).toEqual(['e1'])
    expect(activeTransferEdgeIds(3001)).toEqual([])
  })

  it('still clears the in-flight count when the work fails', async () => {
    await expect(
      withTransfer(
        ['e2'],
        () => Promise.reject(new Error('boom')),
        () => 0
      )
    ).rejects.toThrow('boom')
    expect(activeTransferEdgeIds(10_000)).toEqual([])
  })
})
