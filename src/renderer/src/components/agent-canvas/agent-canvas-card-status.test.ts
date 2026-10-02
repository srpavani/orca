import { describe, expect, it } from 'vitest'
import { createNode, createSessionNode } from '../../../../shared/spatial-canvas/document'
import { agentStatusForNode, cardAgentState } from './agent-canvas-card-status'

const LEAF = '11111111-1111-4111-8111-111111111111'
const layouts = {
  'tab-1': {
    root: { type: 'leaf' as const, leafId: LEAF },
    activeLeafId: LEAF,
    expandedLeafId: null
  }
}
const session = createSessionNode({ sessionId: 'tab-1', label: 'Scout', at: { x: 0, y: 0 } })

describe('card agent status', () => {
  it('resolves a session card status through its active pane', () => {
    const entry = { state: 'working' as const }
    expect(agentStatusForNode(session, layouts, { [`tab-1:${LEAF}`]: entry })).toBe(entry)
    expect(agentStatusForNode(session, layouts, {})).toBeUndefined()
  })

  it('has no status for a card that is not a session', () => {
    const note = createNode(
      { kind: 'note', noteId: 'n', pinnedName: null, readOnly: false },
      {
        x: 0,
        y: 0,
        width: 10,
        height: 10
      }
    )
    expect(
      agentStatusForNode(note, layouts, { [`tab-1:${LEAF}`]: { state: 'working' } })
    ).toBeUndefined()
  })

  it('has no status when the tab has no resolvable pane', () => {
    expect(
      agentStatusForNode(session, {}, { [`tab-1:${LEAF}`]: { state: 'working' } })
    ).toBeUndefined()
  })

  it('reports unknown rather than guessing when Orca has no entry', () => {
    expect(cardAgentState(undefined)).toBe('unknown')
    expect(cardAgentState({ state: 'blocked' })).toBe('blocked')
  })
})
