import { CANVAS_DOCUMENT_VERSION, createDocument } from './document'
import { clampZoom, createViewport } from './geometry'
import type { CanvasDocument, CanvasViewport } from './types'

/** The whole persisted canvas: placement, viewport, and note bodies keyed by note id. */
export type AgentCanvasSnapshot = {
  document: CanvasDocument
  viewport: CanvasViewport
  notes: Record<string, string>
  /** Bumped by the host on every accepted write so clients can drop stale echoes. */
  revision: number
}

export const AGENT_CANVAS_NOTE_MAX_CHARS = 200_000

export function emptyAgentCanvasSnapshot(): AgentCanvasSnapshot {
  return { document: createDocument(), viewport: createViewport(), notes: {}, revision: 0 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLevelContents(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    Array.isArray(value.ties) &&
    Array.isArray(value.groups)
  )
}

export function parseCanvasDocument(value: unknown): CanvasDocument | null {
  if (!isRecord(value) || value.version !== CANVAS_DOCUMENT_VERSION) {
    return null
  }
  if (!isLevelContents(value.root) || !Array.isArray(value.levels)) {
    return null
  }
  if (!Array.isArray(value.bridges) || !value.levels.every(isLevelContents)) {
    return null
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: version, root, levels and bridges are checked above; node payloads only come from Orca's own writers.
  return value as CanvasDocument
}

export function parseCanvasViewport(value: unknown): CanvasViewport {
  if (!isRecord(value) || !isRecord(value.origin)) {
    return createViewport()
  }
  const { x, y } = value.origin
  const zoom = value.zoom
  if (typeof x !== 'number' || typeof y !== 'number' || typeof zoom !== 'number') {
    return createViewport()
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) {
    return createViewport()
  }
  return { origin: { x, y }, zoom: clampZoom(zoom) }
}

export function parseCanvasNotes(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {}
  }
  const notes: Record<string, string> = {}
  for (const [noteId, body] of Object.entries(value)) {
    if (typeof body === 'string') {
      notes[noteId] = body.slice(0, AGENT_CANVAS_NOTE_MAX_CHARS)
    }
  }
  return notes
}

/** Never throws: anything unrecognisable becomes an empty canvas. */
export function parseAgentCanvasSnapshot(value: unknown): AgentCanvasSnapshot {
  if (!isRecord(value)) {
    return emptyAgentCanvasSnapshot()
  }
  const document = parseCanvasDocument(value.document)
  if (document === null) {
    return emptyAgentCanvasSnapshot()
  }
  const revision =
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0
      ? value.revision
      : 0
  return {
    document,
    viewport: parseCanvasViewport(value.viewport),
    notes: parseCanvasNotes(value.notes),
    revision
  }
}
