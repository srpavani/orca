import { describe, expect, it } from 'vitest'
import { createDocument } from '../../../../shared/spatial-canvas/document'
import { createViewport } from '../../../../shared/spatial-canvas/geometry'
import type { AgentCanvasSnapshot } from '../../../../shared/spatial-canvas/agent-canvas-snapshot'
import {
  pushToHost,
  rebaseLocalEdit,
  type CanvasHostTransport,
  type CanvasLocalState
} from './agent-canvas-host-sync'

function snapshot(revision: number, notes: Record<string, string>): AgentCanvasSnapshot {
  return { document: createDocument(), viewport: createViewport(), notes, revision }
}

function local(notes: Record<string, string>): CanvasLocalState {
  return { document: createDocument(), viewport: createViewport(), notes }
}

describe('rebaseLocalEdit', () => {
  it('keeps agent edits to notes the user did not touch and user edits to the rest', () => {
    const base = { plan: 'v1', todo: 'a' }
    const mine = local({ plan: 'v1', todo: 'a, b (user)' })
    const host = snapshot(5, { plan: 'v2 (agent)', todo: 'a' })
    expect(rebaseLocalEdit(mine, { notes: base, document: createDocument() }, host).notes).toEqual({
      plan: 'v2 (agent)',
      todo: 'a, b (user)'
    })
  })

  it('adds a note an agent created while the user was editing', () => {
    const rebased = rebaseLocalEdit(
      local({ mine: 'x' }),
      { notes: { mine: 'x' }, document: createDocument() },
      snapshot(3, { mine: 'x', created: 'by agent' })
    )
    expect(rebased.notes).toEqual({ mine: 'x', created: 'by agent' })
  })

  it('does not resurrect a note the user deleted locally', () => {
    const rebased = rebaseLocalEdit(
      local({}),
      { notes: { gone: 'x' }, document: createDocument() },
      snapshot(2, { gone: 'agent' })
    )
    expect(rebased.notes).toEqual({})
  })
})

describe('pushToHost', () => {
  it('retries a stale save on top of the host snapshot', async () => {
    const saves: number[] = []
    let hostRevision = 3
    const transport: CanvasHostTransport = {
      async get() {
        return { unchanged: false, snapshot: snapshot(hostRevision, {}) }
      },
      async save(input) {
        saves.push(input.baseRevision)
        if (input.baseRevision !== hostRevision) {
          return {
            accepted: false,
            reason: 'stale',
            snapshot: snapshot(hostRevision, { n: 'agent' })
          }
        }
        hostRevision += 1
        return { accepted: true, snapshot: snapshot(hostRevision, input.notes) }
      }
    }
    const saved = await pushToHost(transport, local({ n: 'base' }), {
      revision: 1,
      notes: { n: 'base' },
      document: createDocument()
    })
    expect(saves).toEqual([1, 3])
    expect(saved.revision).toBe(4)
    expect(saved.notes).toEqual({ n: 'agent' })
  })

  it('gives up after three stale answers and adopts the host copy', async () => {
    let saves = 0
    const transport: CanvasHostTransport = {
      async get() {
        return { unchanged: false, snapshot: snapshot(99, { winner: 'host' }) }
      },
      async save() {
        saves += 1
        return { accepted: false, reason: 'stale', snapshot: snapshot(50 + saves, {}) }
      }
    }
    const saved = await pushToHost(transport, local({}), {
      revision: 0,
      notes: {},
      document: createDocument()
    })
    expect(saves).toBe(3)
    expect(saved.notes).toEqual({ winner: 'host' })
  })
})
