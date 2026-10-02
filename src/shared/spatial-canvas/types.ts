/**
 * Spatial agent canvas — core document types.
 *
 * A canvas is a positioned projection of things Orca already owns: sessions
 * (PTYs running agents), notes, portals (embedded browsers) and drawings. The
 * canvas never duplicates a session; a node points at an existing session id.
 *
 * Geometry is stored in *world* space. The renderer converts to screen space
 * through a viewport (origin + zoom); see `./geometry.ts`.
 */

import type { WorkspaceHooks } from './floor-hooks'
import type { FloorLoadState } from './floor-lifecycle'
import type { CanvasAppearance } from './canvas-appearance'

export type CanvasPoint = { x: number; y: number }
export type CanvasRect = { x: number; y: number; width: number; height: number }

/** origin is the world coordinate shown at screen (0, 0). */
export type CanvasViewport = { origin: CanvasPoint; zoom: number }

/** Ground level is `null`; every other level is addressed by its id. */
export type CanvasLevelId = string | null

export type CanvasNodeId = string
export type CanvasEdgeId = string

/**
 * A node's payload. `kind` is the discriminant; everything else is per-kind so
 * that adding a node type never widens the common shape.
 */
export type CanvasNodeContent =
  | CanvasSessionContent
  | CanvasNoteContent
  | CanvasTextContent
  | CanvasStackContent
  | CanvasPortalContent
  | CanvasDrawingContent
  | CanvasBridgeContent

export type CanvasSessionContent = {
  kind: 'session'
  /** Orca session/PTY id this node projects. Never a copy of the session. */
  sessionId: string
  label: string
  roleId: string | null
  /** The lead agent coordinates; peers address it by name. */
  isLead: boolean
  /**
   * Canvas-only name the user or a recruiter pinned. While set, the node keeps
   * this label through terminal title changes; absent means follow the title.
   */
  name?: string | null
  /**
   * Sonar: whether this session's activity is watched and the user is told when
   * it falls quiet. Absent means watched — the canvas exists for agents, and a
   * card the user placed is a card they care about.
   */
  watched?: boolean
}

/** Sticky-note paper colours. A note keeps its colour in every theme. */
export type CanvasNoteColor =
  | 'yellow'
  | 'pink'
  | 'blue'
  | 'green'
  | 'orange'
  | 'purple'
  | 'white'
  | 'charcoal'
  | 'slate'
  | 'midnight'

export type CanvasNoteContent = {
  kind: 'note'
  noteId: string
  /** Pinned display name; when null the name follows the first line of the body. */
  pinnedName: string | null
  readOnly: boolean
  /** Absent on canvases saved before notes carried paper colours; defaults to yellow. */
  color?: CanvasNoteColor
}

export type CanvasStackContent = {
  kind: 'stack'
  /** Node ids of the member notes, in page order. */
  memberNodeIds: CanvasNodeId[]
}

/**
 * A block of plain text on the board. It is a note without paper: the reference
 * offers both, and a text block reads as prose where a sticky reads as a memo.
 */
export type CanvasTextContent = {
  kind: 'text'
  /** Key into the snapshot's body map, the same store notes use. */
  textId: string
  pinnedName: string | null
}

export type CanvasPortalContent = {
  kind: 'portal'
  portalId: string
  url: string
}

export type CanvasDrawingContent = {
  kind: 'drawing'
  shape: CanvasShape
}

/** Reserves a slot for a future cross-level handle; carries no payload yet. */
export type CanvasBridgeContent = { kind: 'bridge' }

export type CanvasShape =
  | { type: 'rect'; width: number; height: number; cornerRadius: number }
  | { type: 'ellipse'; width: number; height: number }
  | { type: 'arrow'; from: CanvasPoint; to: CanvasPoint }
  | { type: 'freehand'; points: CanvasPoint[] }

export type CanvasNode = {
  id: CanvasNodeId
  frame: CanvasRect
  zIndex: number
  /**
   * Locked cards cannot be dragged, wired or selected — the reference's Lock.
   * Absent means unlocked.
   */
  locked?: boolean
  content: CanvasNodeContent
}

/**
 * Edges are the permission graph. Drawing one grants reachability between the
 * two endpoints; deleting it revokes. There is no separate ACL.
 */
export type CanvasEdgeKind =
  | 'session-session'
  | 'session-note'
  | 'note-note'
  | 'session-portal'
  | 'portal-portal'
  | 'session-drawing'

type CanvasEdgeBase = {
  id: CanvasEdgeId
  createdAt: string
  /**
   * Manual rope control points. `null` means the curve is derived from the
   * endpoint frames each render.
   */
  ropePoints: CanvasPoint[] | null
}

export type CanvasEdge =
  | (CanvasEdgeBase & { kind: 'session-session'; fromNodeId: CanvasNodeId; toNodeId: CanvasNodeId })
  | (CanvasEdgeBase & { kind: 'session-note'; fromNodeId: CanvasNodeId; toNodeId: CanvasNodeId })
  | (CanvasEdgeBase & { kind: 'note-note'; fromNodeId: CanvasNodeId; toNodeId: CanvasNodeId })
  | (CanvasEdgeBase & { kind: 'session-portal'; fromNodeId: CanvasNodeId; toNodeId: CanvasNodeId })
  | (CanvasEdgeBase & { kind: 'portal-portal'; fromNodeId: CanvasNodeId; toNodeId: CanvasNodeId })
  | (CanvasEdgeBase & { kind: 'session-drawing'; fromNodeId: CanvasNodeId; toNodeId: CanvasNodeId })

export type CanvasEdgeEndpoint = {
  kind: CanvasEdgeKind
  fromNodeId: CanvasNodeId
  toNodeId: CanvasNodeId
}

/** A visual bundle that gathers several ropes so the canvas stays readable. */
export type CanvasTie = {
  id: string
  edgeIds: CanvasEdgeId[]
  label: string | null
}

export type CanvasGroup = {
  id: string
  nodeIds: CanvasNodeId[]
  label: string
  colorToken: string
}

/** One level's contents. Ground level stores this directly on the document. */
export type CanvasLevelContents = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  ties: CanvasTie[]
  groups: CanvasGroup[]
}

/** A level is a full, isolated copy of the canvas — typically another branch. */
export type CanvasLevel = CanvasLevelContents & {
  id: string
  name: string
  /** Git branch this level is pinned to, when it is an isolated worktree. */
  branch: string | null
  /**
   * Whether the level's own checkout is loaded. An unloaded level keeps its
   * cards and notes but its files are freed; absent means loaded.
   */
  state?: FloorLoadState
}

/**
 * A bridge is the cross-level analogue of an edge: it makes a session on one
 * level reachable from a session on another, through a `bridge` node.
 */
export type CanvasBridge = {
  id: string
  bridgeNodeId: CanvasNodeId
  fromNodeId: CanvasNodeId
  toNodeId: CanvasNodeId
  fromLevelId: CanvasLevelId
  toLevelId: CanvasLevelId
}

export type CanvasDocument = {
  version: number
  /** Ground level contents (level id `null`). */
  root: CanvasLevelContents
  levels: CanvasLevel[]
  bridges: CanvasBridge[]
  /**
   * Shell commands run around a floor's life, shared by every floor and executed
   * with that floor's identity in the environment. Absent means none.
   */
  hooks?: WorkspaceHooks
  /** How the board itself is painted: background, wire behaviour, selection. */
  appearance?: CanvasAppearance
}
