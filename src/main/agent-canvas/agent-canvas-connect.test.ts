import { describe, expect, it } from 'vitest'
import {
  addNode,
  connectNodes,
  createDocument,
  createSessionNode
} from '../../shared/spatial-canvas/document'
import { emptyAgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { createLevel } from '../../shared/spatial-canvas/level-edits'
import { everyEdge } from '../../shared/spatial-canvas/levels'
import { connectTeamSessions } from './agent-canvas-connect'

let next = 0
const id = (): string => `n${++next}`

/** Lead wired to Reviewer and Tester; Stranger is on the board, unwired. */
function team(testerOnFloor = false) {
  const lead = createSessionNode({ sessionId: 'lead', label: 'Lead', at: { x: 0, y: 0 }, id })
  const reviewer = createSessionNode({
    sessionId: 'rev',
    label: 'Reviewer',
    at: { x: 0, y: 0 },
    id
  })
  const tester = createSessionNode({ sessionId: 'test', label: 'Tester', at: { x: 0, y: 0 }, id })
  const stranger = createSessionNode({ sessionId: 'x', label: 'Stranger', at: { x: 0, y: 0 }, id })
  let document = addNode(addNode(addNode(createDocument(), lead), reviewer), stranger)
  if (testerOnFloor) {
    const floor = createLevel(document, { name: 'Experiment' })
    document = addNode(floor.document, tester, floor.levelId)
    document = {
      ...document,
      bridges: [
        {
          id: id(),
          bridgeNodeId: lead.id,
          fromNodeId: lead.id,
          toNodeId: tester.id,
          fromLevelId: null,
          toLevelId: floor.levelId
        }
      ]
    }
  } else {
    document = addNode(document, tester)
    document = connectNodes(document, lead.id, tester.id, 'now', id)!.document
  }
  document = connectNodes(document, lead.id, reviewer.id, 'now', id)!.document
  return { ...emptyAgentCanvasSnapshot(), document }
}

describe('connectTeamSessions', () => {
  it('wires two of the caller’s peers so they can ask each other', () => {
    const snapshot = team()
    const before = everyEdge(snapshot.document).length
    const { document, result } = connectTeamSessions(snapshot, 'lead', 'reviewer', 'Tester', 'now')
    expect(result).toMatchObject({ created: true, via: 'wire' })
    expect(everyEdge(document)).toHaveLength(before + 1)
  })

  it('is a no-op when the two are already joined', () => {
    const { result } = connectTeamSessions(team(), 'lead', 'Lead', 'Reviewer', 'now')
    expect(result.created).toBe(false)
  })

  it('bridges peers on different floors', () => {
    const { document, result } = connectTeamSessions(
      team(true),
      'lead',
      'Reviewer',
      'Tester',
      'now'
    )
    expect(result.via).toBe('bridge')
    expect(document.bridges).toHaveLength(2)
  })

  it('refuses a session outside the caller’s reach', () => {
    expect(() => connectTeamSessions(team(), 'lead', 'Reviewer', 'Stranger', 'now')).toThrow(
      expect.objectContaining({ code: 'canvas_peer_not_connected' })
    )
  })
})
