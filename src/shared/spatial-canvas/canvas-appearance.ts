/**
 * Canvas appearance, with the reference's options.
 *
 * Three independent choices, read out of Maestri's canvas settings:
 * the board's background, how a wire behaves where it meets a card, and how a
 * selected card is marked. Every option here exists in the reference; the
 * defaults are what the reference ships, so a board that never opens this sheet
 * looks unchanged.
 */

export type CanvasBackgroundStyle = 'grid' | 'plain' | 'transparent'
export type CanvasConnectionStyle = 'avoidNodes' | 'behindNodes' | 'circuit'
export type CanvasSelectionStyle =
  | 'dashedBorder'
  | 'solidBorder'
  | 'corners'
  | 'cornerDots'
  | 'elevation'

export type CanvasAppearance = {
  background: CanvasBackgroundStyle
  connectionStyle: CanvasConnectionStyle
  selectionStyle: CanvasSelectionStyle
}

export const CANVAS_BACKGROUND_STYLES: readonly CanvasBackgroundStyle[] = [
  'grid',
  'plain',
  'transparent'
]
export const CANVAS_CONNECTION_STYLES: readonly CanvasConnectionStyle[] = [
  'avoidNodes',
  'behindNodes',
  'circuit'
]
export const CANVAS_SELECTION_STYLES: readonly CanvasSelectionStyle[] = [
  'dashedBorder',
  'solidBorder',
  'corners',
  'cornerDots',
  'elevation'
]

export function defaultCanvasAppearance(): CanvasAppearance {
  return {
    // Graph paper, wires that go around cards, and selection shown by lifting the
    // card: the reference's own defaults, and what this port already drew.
    background: 'grid',
    connectionStyle: 'avoidNodes',
    selectionStyle: 'elevation'
  }
}

/** Reads a stored appearance, falling back per field so one bad value cannot lose the rest. */
export function parseCanvasAppearance(value: unknown): CanvasAppearance {
  const base = defaultCanvasAppearance()
  if (typeof value !== 'object' || value === null) {
    return base
  }
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const candidate: unknown = key in value ? Reflect.get(value, key) : undefined
    return allowed.find((entry) => entry === candidate) ?? fallback
  }
  return {
    background: pick('background', CANVAS_BACKGROUND_STYLES, base.background),
    connectionStyle: pick('connectionStyle', CANVAS_CONNECTION_STYLES, base.connectionStyle),
    selectionStyle: pick('selectionStyle', CANVAS_SELECTION_STYLES, base.selectionStyle)
  }
}

/** World size of one graph-paper square, matching the canvas grid everywhere else. */
export const CANVAS_GRID_CELL = 20

/**
 * The board's stored appearance. Typed structurally rather than against
 * CanvasDocument so this module does not have to import the document type back.
 */
export function documentAppearance(document: { appearance?: CanvasAppearance }): CanvasAppearance {
  return document.appearance ?? defaultCanvasAppearance()
}

export type CanvasSurfaceStyle = {
  backgroundColor: string | undefined
  backgroundImage: string | undefined
  backgroundSize: string | undefined
  backgroundPosition: string | undefined
}

/**
 * The board's paint. `transparent` drops the fill as well, so an embedder (or a
 * screenshot) sees through it; `plain` keeps the fill and drops the ruling.
 */
export function canvasSurfaceStyle(
  appearance: CanvasAppearance,
  viewport: { origin: { x: number; y: number }; zoom: number },
  devicePixelRatio = 1
): CanvasSurfaceStyle {
  const backgroundColor =
    appearance.background === 'transparent' ? undefined : 'var(--color-canvas-surface)'
  if (appearance.background !== 'grid') {
    return {
      backgroundColor,
      backgroundImage: undefined,
      backgroundSize: undefined,
      backgroundPosition: undefined
    }
  }
  const thickness = devicePixelRatio >= 1.5 ? 0.5 : 1
  const cell = CANVAS_GRID_CELL * viewport.zoom
  const line = `color-mix(in srgb, var(--color-canvas-grid-line) ${thickness === 1 ? 50 : 100}%, transparent)`
  const vertical = `linear-gradient(to right, ${line} 0, ${line} ${thickness}px, transparent ${thickness}px, transparent 100%)`
  const horizontal = `linear-gradient(to bottom, ${line} 0, ${line} ${thickness}px, transparent ${thickness}px, transparent 100%)`
  return {
    backgroundColor,
    backgroundImage: `${vertical}, ${horizontal}`,
    backgroundSize: `${cell}px ${cell}px`,
    backgroundPosition: `${-viewport.origin.x * viewport.zoom}px ${-viewport.origin.y * viewport.zoom}px`
  }
}

/**
 * Whether a wire drapes around the cards. `behindNodes` lets it pass under them —
 * which is what "behind" means on a board made of paper.
 */
export function ropeAvoidsNodes(appearance: CanvasAppearance): boolean {
  return appearance.connectionStyle === 'avoidNodes'
}

export type CanvasPointLike = { x: number; y: number }

/** Rounded corner of an orthogonal route, in world units. */
export const CIRCUIT_CORNER_RADIUS = 8

/**
 * A circuit route: the wire leaves along the dominant axis, turns once at the
 * midpoint, and arrives along the other axis — the "Schaltkreis" option. Corners
 * are rounded so it reads as a trace rather than a wireframe.
 */
export function circuitPath(points: readonly CanvasPointLike[]): string {
  if (points.length < 2) {
    return ''
  }
  const start = points[0]
  const end = points.at(-1)
  if (!end) {
    return ''
  }
  const midX = (start.x + end.x) / 2
  const horizontalFirst = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
  const corners: CanvasPointLike[] = horizontalFirst
    ? [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
    : [start, { x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }, end]
  const radius = CIRCUIT_CORNER_RADIUS
  const round = (value: number): string => value.toFixed(2)
  let path = `M ${round(corners[0].x)} ${round(corners[0].y)}`
  for (let index = 1; index < corners.length - 1; index += 1) {
    const previous = corners[index - 1]
    const corner = corners[index]
    const next = corners[index + 1]
    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y)
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y)
    const cut = Math.min(radius, inLength / 2, outLength / 2)
    const entry = {
      x: corner.x - Math.sign(corner.x - previous.x) * cut,
      y: corner.y - Math.sign(corner.y - previous.y) * cut
    }
    const exit = {
      x: corner.x + Math.sign(next.x - corner.x) * cut,
      y: corner.y + Math.sign(next.y - corner.y) * cut
    }
    path += ` L ${round(entry.x)} ${round(entry.y)} Q ${round(corner.x)} ${round(corner.y)} ${round(exit.x)} ${round(exit.y)}`
  }
  const last = corners.at(-1) ?? start
  path += ` L ${round(last.x)} ${round(last.y)}`
  return path
}

export type CanvasSelectionPaint = {
  /** Box-shadow for the card, if the style uses one. */
  boxShadow: 'elevated' | 'default'
  /** Border treatment, if the style uses one. */
  border: 'dashed' | 'solid' | 'none'
  /** Corner marks drawn on the card's corners. */
  marks: 'none' | 'brackets' | 'dots'
}

/** What a selected card looks like under the chosen style. */
export function selectionPaint(style: CanvasSelectionStyle): CanvasSelectionPaint {
  switch (style) {
    case 'dashedBorder':
      return { boxShadow: 'default', border: 'dashed', marks: 'none' }
    case 'solidBorder':
      return { boxShadow: 'default', border: 'solid', marks: 'none' }
    case 'corners':
      return { boxShadow: 'default', border: 'none', marks: 'brackets' }
    case 'cornerDots':
      return { boxShadow: 'default', border: 'none', marks: 'dots' }
    case 'elevation':
      // Why elevation is the default: on a board of paper, the selected card being
      // the one that looks lifted is the reference's own way of saying it.
      return { boxShadow: 'elevated', border: 'none', marks: 'none' }
  }
}
