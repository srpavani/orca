import {
  DEFAULT_NODE_SIZE,
  addNode,
  createSessionNode,
  newCanvasId,
  type CanvasIdFactory
} from './document'
import { GROUND_ORIGIN } from './geometry'
import { everyNode } from './levels'
import type {
  CanvasDocument,
  CanvasLevelContents,
  CanvasLevelId,
  CanvasNode,
  CanvasPoint
} from './types'

/** A terminal session the canvas can project. `sessionId` is the Orca tab id. */
export type CanvasLiveSession = {
  sessionId: string
  label: string
  worktreeId: string
  /** Git branch of the session's worktree, when known; picks the floor pinned to it. */
  branch?: string | null
}

const GRID_COLUMNS = 3
const GRID_GAP = 80

/** Next free slot in a left-to-right grid, so auto-placed sessions never overlap. */
export function gridSlot(index: number): CanvasPoint {
  const column = index % GRID_COLUMNS
  const row = Math.floor(index / GRID_COLUMNS)
  return {
    x: GROUND_ORIGIN.x + GRID_GAP + column * (DEFAULT_NODE_SIZE.width + GRID_GAP),
    y: GROUND_ORIGIN.y + GRID_GAP + row * (DEFAULT_NODE_SIZE.height + GRID_GAP)
  }
}

/** `refs/heads/feature/x` and `feature/x` name the same branch. */
export function normalizeBranch(branch: string | null | undefined): string | null {
  const trimmed = branch?.trim().replace(/^refs\/heads\//, '') ?? ''
  return trimmed.length > 0 ? trimmed : null
}

/** The floor pinned to the session's branch, else the ground. */
export function floorForBranch(
  document: CanvasDocument,
  branch: string | null | undefined
): CanvasLevelId {
  const wanted = normalizeBranch(branch)
  if (wanted === null) {
    return null
  }
  return document.levels.find((level) => normalizeBranch(level.branch) === wanted)?.id ?? null
}

function relabel(
  contents: CanvasLevelContents,
  labels: ReadonlyMap<string, string>
): CanvasLevelContents {
  let changed = false
  const nodes = contents.nodes.map((node): CanvasNode => {
    if (node.content.kind !== 'session') {
      return node
    }
    // A pinned canvas name outranks the terminal title: peers address an agent by the
    // name it was recruited with, so a title change must not rename it mid-conversation.
    if (node.content.name) {
      return node
    }
    const label = labels.get(node.content.sessionId)
    if (label === undefined || label === node.content.label) {
      return node
    }
    changed = true
    return { ...node, content: { ...node.content, label } }
  })
  return changed ? { ...contents, nodes } : contents
}

function slotCount(document: CanvasDocument, levelId: CanvasLevelId): number {
  const contents =
    levelId === null ? document.root : document.levels.find((level) => level.id === levelId)
  return contents?.nodes.filter((node) => node.content.kind === 'session').length ?? 0
}

/**
 * Projects live sessions onto the canvas: unseen sessions get a grid slot on
 * the floor pinned to their branch (else the ground), and known ones follow
 * their tab's title. Sessions that disappeared are kept on purpose — tabs
 * hydrate after the canvas, and dropping a node would silently revoke every
 * wire (permission) attached to it. A session already placed is never moved:
 * the user may have put it on another floor deliberately.
 */
export function syncSessionNodes(
  document: CanvasDocument,
  sessions: readonly CanvasLiveSession[],
  id: CanvasIdFactory = newCanvasId
): CanvasDocument {
  const repaired = repairSurfaceSessionIds(document)
  const labels = new Map(sessions.map((session) => [session.sessionId, session.label]))
  const root = relabel(repaired.root, labels)
  const levels = repaired.levels.map((level) => {
    const contents = relabel(level, labels)
    return contents === level ? level : { ...level, ...contents }
  })
  // Why: keep the reference when nothing changed so the store skips re-render and persistence.
  const relabelled: CanvasDocument =
    root === repaired.root && levels.every((level, index) => level === repaired.levels[index])
      ? repaired
      : { ...repaired, root, levels }
  const placed = new Set<string>()
  for (const node of everyNode(relabelled)) {
    if (node.content.kind === 'session') {
      placed.add(node.content.sessionId)
    }
  }
  let next = relabelled
  for (const session of sessions) {
    if (placed.has(session.sessionId)) {
      continue
    }
    const levelId = floorForBranch(next, session.branch)
    const node = createSessionNode({
      sessionId: session.sessionId,
      label: session.label,
      at: gridSlot(slotCount(next, levelId)),
      id
    })
    next = addNode(next, node, levelId)
    placed.add(session.sessionId)
  }
  return next
}

/**
 * The session id a card is keyed by: the Orca tab id. Terminal creation answers
 * with the host surface id `tab::leaf`; the leaf is cut so the card matches the
 * tab the rest of Orca (and the CLI caller) knows.
 */
export function canvasSessionIdOf(surfaceId: string): string {
  const cut = surfaceId.indexOf('::')
  return cut === -1 ? surfaceId : surfaceId.slice(0, cut)
}

/**
 * Repairs cards saved with a surface id (`tab::leaf`) instead of the tab id. A
 * repaired card that now duplicates one already keyed by the bare tab id is
 * merged into it: the survivor is whichever of the two carries wires (else the
 * one already correct), and the other's wires move over to it, so no
 * permission is lost.
 */
export function repairSurfaceSessionIds(document: CanvasDocument): CanvasDocument {
  const all = everyNode(document)
  if (
    !all.some((node) => node.content.kind === 'session' && node.content.sessionId.includes('::'))
  ) {
    return document
  }
  const edges = [...document.root.edges, ...document.levels.flatMap((level) => level.edges)]
  const wired = (nodeId: string): boolean =>
    edges.some((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId)
  const keeperBySession = new Map<string, string>()
  const replaced = new Map<string, string>()
  for (const node of all) {
    if (node.content.kind !== 'session') {
      continue
    }
    const sessionId = canvasSessionIdOf(node.content.sessionId)
    const keeper = keeperBySession.get(sessionId)
    if (keeper === undefined) {
      keeperBySession.set(sessionId, node.id)
      continue
    }
    const [survivor, dropped] =
      wired(node.id) && !wired(keeper) ? [node.id, keeper] : [keeper, node.id]
    keeperBySession.set(sessionId, survivor)
    replaced.set(dropped, survivor)
  }
  const fix = (contents: CanvasLevelContents): CanvasLevelContents => {
    const remap = (id: string): string => replaced.get(id) ?? id
    const seen = new Set<string>()
    return {
      ...contents,
      nodes: contents.nodes
        .filter((node) => !replaced.has(node.id))
        .map((node) =>
          node.content.kind === 'session' && node.content.sessionId.includes('::')
            ? {
                ...node,
                content: { ...node.content, sessionId: canvasSessionIdOf(node.content.sessionId) }
              }
            : node
        ),
      edges: contents.edges
        .map((edge) => ({
          ...edge,
          fromNodeId: remap(edge.fromNodeId),
          toNodeId: remap(edge.toNodeId)
        }))
        .filter((edge) => {
          const key = [edge.fromNodeId, edge.toNodeId].sort().join('|')
          if (edge.fromNodeId === edge.toNodeId || seen.has(key)) {
            return false
          }
          seen.add(key)
          return true
        })
    }
  }
  return {
    ...document,
    root: fix(document.root),
    levels: document.levels.map((level) => ({ ...level, ...fix(level) }))
  }
}
