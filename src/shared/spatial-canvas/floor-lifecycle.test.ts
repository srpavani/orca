import { describe, expect, it } from 'vitest'
import {
  canUnloadFloor,
  floorLoadState,
  levelIsUnloaded,
  withFloorLoadState
} from './floor-lifecycle'

describe('floor load state', () => {
  it('treats a floor with no state as active', () => {
    expect(floorLoadState({})).toBe('active')
    expect(levelIsUnloaded({})).toBe(false)
    expect(levelIsUnloaded({ state: 'unloaded' })).toBe(true)
  })

  it('only offers unload for a floor that has its own checkout', () => {
    expect(canUnloadFloor({ branch: 'refactor-auth' })).toBe(true)
    expect(canUnloadFloor({ branch: null })).toBe(false)
    expect(canUnloadFloor({ branch: '   ' })).toBe(false)
  })

  it('applies a state without disturbing the rest of the descriptor', () => {
    const level = { id: 'f1', name: 'Refactor', branch: 'refactor-auth', state: 'active' as const }
    expect(withFloorLoadState(level, 'unloaded')).toEqual({ ...level, state: 'unloaded' })
    expect(withFloorLoadState(level, 'active')).toEqual(level)
  })
})
