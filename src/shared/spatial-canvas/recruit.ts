import { bridgeSessions } from './bridges'
import {
  addNode,
  connectNodes,
  createSessionNode,
  newCanvasId,
  type CanvasIdFactory
} from './document'
import { levelContents, levelIdOfNode, levelsOf } from './levels'
import { duplicateSessionLabel } from './reachability'
import { gridSlot } from './session-placement'
import type {
  CanvasDocument,
  CanvasLevelId,
  CanvasNode,
  CanvasNodeId,
  CanvasSessionContent
} from './types'

export type RecruitRefusal =
  | 'label-taken'
  | 'caller-missing'
  | 'caller-not-session'
  | 'level-missing'

/** Resolves a floor by name, case-insensitively; the ground floor answers to "Ground". */
export function findLevelByName(document: CanvasDocument, name: string): CanvasLevelId | undefined {
  const needle = name.trim().toLowerCase()
  const match = levelsOf(document).find((level) => level.name.trim().toLowerCase() === needle)
  return match === undefined ? undefined : match.id
}

/**
 * Puts a newly spawned session on the canvas and connects it to whoever
 * recruited it. The connection matters more than the card: a recruit nobody can
 * reach is an agent the team can see and never ask, so a recruit that lands on
 * another floor gets a bridge, not a dangling card.
 */
export function placeRecruit(
  document: CanvasDocument,
  input: {
    callerNodeId: CanvasNodeId
    sessionId: string
    label: string
    /** Floor to place on; undefined uses the caller's own floor. */
    levelId?: CanvasLevelId
    id?: CanvasIdFactory
  }
):
  | { document: CanvasDocument; nodeId: CanvasNodeId; levelId: CanvasLevelId; bridged: boolean }
  | { refused: RecruitRefusal } {
  const id = input.id ?? newCanvasId
  const caller = levelsOf(document)
    .flatMap((level) => level.contents.nodes)
    .find((node) => node.id === input.callerNodeId)
  if (!caller) {
    return { refused: 'caller-missing' }
  }
  if (caller.content.kind !== 'session') {
    return { refused: 'caller-not-session' }
  }
  if (input.levelId !== undefined && levelContents(document, input.levelId) === null) {
    return { refused: 'level-missing' }
  }
  if (duplicateSessionLabel(document, input.label)) {
    return { refused: 'label-taken' }
  }
  const callerLevelId = levelIdOfNode(document, caller.id)
  const levelId = input.levelId ?? callerLevelId
  const onFloor = levelContents(document, levelId) ?? document.root
  const node = createSessionNode({
    sessionId: input.sessionId,
    label: input.label,
    at: gridSlot(onFloor.nodes.filter((item) => item.content.kind === 'session').length),
    id
  })
  // Why pinned: a recruit is addressed by the name it was created with, so a later
  // terminal title change must not rename it out from under the caller.
  const content: CanvasSessionContent = {
    kind: 'session',
    sessionId: input.sessionId,
    label: input.label,
    roleId: null,
    isLead: false,
    name: input.label
  }
  const pinned: CanvasNode = { ...node, content }
  const placed = addNode(document, pinned, levelId)
  if (levelId === callerLevelId) {
    const wired = connectNodes(placed, caller.id, pinned.id, new Date().toISOString(), id)
    return { document: wired?.document ?? placed, nodeId: pinned.id, levelId, bridged: false }
  }
  const bridged = bridgeSessions(placed, caller.id, pinned.id, id)
  return {
    document: 'refused' in bridged ? placed : bridged.document,
    nodeId: pinned.id,
    levelId,
    bridged: !('refused' in bridged)
  }
}
