// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  MAX_LIVE_CANVAS_PANES,
  buildCanvasPortals,
  canvasPaneKey,
  type CanvasLivePaneRequest
} from './agent-canvas-live-panes'

const LEAF_A = '11111111-1111-4111-8111-111111111111'
const LEAF_B = '22222222-2222-4222-8222-222222222222'

const layout = (activeLeafId: string | null, leafId = LEAF_A) => ({
  root: { type: 'leaf' as const, leafId },
  activeLeafId,
  expandedLeafId: null
})

describe('canvasPaneKey', () => {
  it('uses the active leaf, then the first leaf, and rejects non-UUID leaves', () => {
    expect(canvasPaneKey('tab-1', layout(LEAF_B))).toBe(`tab-1:${LEAF_B}`)
    expect(canvasPaneKey('tab-1', layout(null))).toBe(`tab-1:${LEAF_A}`)
    expect(canvasPaneKey('tab-1', layout(null, 'legacy-0'))).toBeNull()
    expect(canvasPaneKey('tab-1', undefined)).toBeNull()
  })
})

describe('buildCanvasPortals', () => {
  const target = document.createElement('div')
  const request = (index: number, focused = false): CanvasLivePaneRequest => ({
    nodeId: `node-${index}`,
    sessionId: `tab-${index}`,
    worktreeId: 'wt',
    target,
    focused
  })

  it('skips sessions with no resolvable pane', () => {
    const portals = buildCanvasPortals([request(1), request(2)], { 'tab-1': layout(LEAF_A) })
    expect(portals.map((portal) => portal.tabId)).toEqual(['tab-1'])
    expect(portals[0]).toMatchObject({
      slotId: 'agent-canvas:node-1',
      paneKey: `tab-1:${LEAF_A}`,
      worktreeId: 'wt',
      active: false
    })
  })

  it('caps live panes but always keeps the focused card', () => {
    const count = MAX_LIVE_CANVAS_PANES + 3
    const requests = Array.from({ length: count }, (_, index) =>
      request(index, index === count - 1)
    )
    const layouts = Object.fromEntries(requests.map((item) => [item.sessionId, layout(LEAF_A)]))
    const portals = buildCanvasPortals(requests, layouts)
    expect(portals).toHaveLength(MAX_LIVE_CANVAS_PANES)
    expect(portals[0]).toMatchObject({ tabId: `tab-${count - 1}`, active: true })
  })
})
