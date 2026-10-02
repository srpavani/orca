import { CANVAS_DOCUMENT_VERSION, createDocument } from '../../../../shared/spatial-canvas/document'
import { clampZoom, createViewport } from '../../../../shared/spatial-canvas/geometry'
import type { CanvasDocument, CanvasViewport } from '../../../../shared/spatial-canvas/types'

export const AGENT_CANVAS_STORAGE_KEY = 'orca.agentCanvas.v1'

export type PersistedAgentCanvas = {
  document: CanvasDocument
  viewport: CanvasViewport
  /** Note bodies keyed by note id; the document only stores placement. */
  notes: Record<string, string>
}

export function emptyAgentCanvas(): PersistedAgentCanvas {
  return { document: createDocument(), viewport: createViewport(), notes: {} }
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

function parseDocument(value: unknown): CanvasDocument | null {
  if (!isRecord(value) || value.version !== CANVAS_DOCUMENT_VERSION) {
    return null
  }
  if (!isLevelContents(value.root) || !Array.isArray(value.levels)) {
    return null
  }
  if (!Array.isArray(value.bridges) || !value.levels.every(isLevelContents)) {
    return null
  }
  // Why: shape was checked structurally above; node payloads are produced only
  // by this module's own writer, so a deeper per-node schema would add cost
  // without catching a realistic corruption.
  return value as CanvasDocument
}

function parseViewport(value: unknown): CanvasViewport {
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

function parseNotes(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {}
  }
  const notes: Record<string, string> = {}
  for (const [noteId, body] of Object.entries(value)) {
    if (typeof body === 'string') {
      notes[noteId] = body
    }
  }
  return notes
}

/** Never throws: a corrupt or foreign payload falls back to an empty canvas. */
export function parsePersistedAgentCanvas(raw: string | null): PersistedAgentCanvas {
  if (raw === null) {
    return emptyAgentCanvas()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return emptyAgentCanvas()
  }
  if (!isRecord(parsed)) {
    return emptyAgentCanvas()
  }
  const document = parseDocument(parsed.document)
  if (document === null) {
    return emptyAgentCanvas()
  }
  return { document, viewport: parseViewport(parsed.viewport), notes: parseNotes(parsed.notes) }
}

export function serializeAgentCanvas(canvas: PersistedAgentCanvas): string {
  return JSON.stringify(canvas)
}
