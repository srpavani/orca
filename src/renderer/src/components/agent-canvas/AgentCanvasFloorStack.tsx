import React from 'react'
import {
  FLOOR_CORNER_RADIUS,
  FLOOR_GRID_CELL_PX,
  FLOOR_LIVE_OFFSET_Y,
  FLOOR_OVERVIEW_SCALE,
  FLOOR_TILT_DEGREES,
  floorGhostOpacity,
  floorPerspectivePx,
  floorYOffset,
  floorsAbove,
  floorsBelow,
  type FloorStackItem
} from '../../../../shared/spatial-canvas/floor-stack'

/** Approximates the reference's springs: the stack eases with a touch of overshoot. */
const SHEET_TRANSITION = 'transform 500ms cubic-bezier(0.34, 1.06, 0.5, 1)'
/** The stage is critically damped, so it settles without bouncing. */
const STAGE_TRANSITION =
  'transform 400ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms cubic-bezier(0.22, 1, 0.36, 1)'
/** How long the sheets stay mounted after the overview is switched off. */
const EXIT_MS = 420

/**
 * A floor sheet: the same graph paper as the canvas, framed by the floor's own
 * colour as an edge rather than a wash, lifted by the floor shadow. Every value
 * is the reference's, so a floor card reads the same in both products.
 */
export function AgentCanvasFloorCard(props: {
  item: FloorStackItem
  children?: React.ReactNode
}): React.JSX.Element {
  const { item } = props
  const line = 'color-mix(in srgb, var(--color-canvas-grid-line) 65%, transparent)'
  const vertical = `linear-gradient(to right, ${line} 0, ${line} 1px, transparent 1px, transparent 100%)`
  const horizontal = `linear-gradient(to bottom, ${line} 0, ${line} 1px, transparent 1px, transparent 100%)`
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        borderRadius: FLOOR_CORNER_RADIUS,
        backgroundColor: 'var(--color-canvas-surface)',
        backgroundImage: `${vertical}, ${horizontal}`,
        backgroundSize: `${FLOOR_GRID_CELL_PX}px ${FLOOR_GRID_CELL_PX}px`,
        // A coloured floor's colour is its edge, so a coloured floor stays a canvas
        // instead of becoming a swatch; otherwise the ordinary strong hairline.
        boxShadow: [
          item.color
            ? `inset 0 0 0 1px color-mix(in srgb, ${item.color} 55%, transparent)`
            : 'inset 0 0 0 1px var(--color-canvas-border-strong)',
          // Why a shadow and not only a border: a sheet at a distance with no shadow
          // reads as a hole in a darkened stage rather than a card lying on it.
          'var(--canvas-floor-shadow)'
        ].join(', ')
      }}
    >
      {props.children ??
        (item.snapshot ? (
          // The reference's FloorCard: the floor's last picture fills the sheet.
          <img
            src={item.snapshot}
            alt=""
            data-floor-snapshot=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 px-8 text-center">
            <span
              className="text-2xl font-medium leading-tight"
              style={{ color: 'color-mix(in srgb, var(--foreground) 62%, transparent)' }}
            >
              {item.name}
            </span>
            <span
              className="text-sm leading-tight"
              style={{ color: 'color-mix(in srgb, var(--foreground) 42%, transparent)' }}
            >
              {item.detail}
            </span>
          </div>
        ))}
    </div>
  )
}

/** One ghost sheet: tilted back, offset along the stack, faded by which layer owns it. */
function GhostSheet(props: {
  item: FloorStackItem
  layer: 'above' | 'below'
  visible: boolean
  reduceMotion: boolean
}): React.JSX.Element {
  const { item, layer } = props
  return (
    <div
      aria-hidden="true"
      data-floor-layer={layer}
      data-floor-key={item.key}
      className="pointer-events-none absolute inset-0"
      style={{
        opacity: props.visible ? floorGhostOpacity(item.relativePosition, layer) : 0,
        transformOrigin: 'center center',
        // Same composition order as the reference: translate, then scale, then rotate.
        transform: `translateY(${floorYOffset(item.relativePosition)}px) scale(${FLOOR_OVERVIEW_SCALE}) rotateX(${FLOOR_TILT_DEGREES}deg)`,
        transition: props.reduceMotion ? 'none' : SHEET_TRANSITION
      }}
    >
      <AgentCanvasFloorCard item={item} />
    </div>
  )
}

/**
 * The floor stack. Engaging it tilts the live canvas back and slides it down,
 * then draws the other floors as sheets above and below it. The stage owns the
 * perspective, so the tilt stays proportional to the window instead of a fixed
 * pixel value, and the sheets are non-interactive — switching floors is the
 * list's job, so a tilted sheet never eats a click meant for the canvas.
 */
export function AgentCanvasFloorStack(props: {
  stack: readonly FloorStackItem[]
  /** True while the overview is engaged. */
  live: boolean
  stageHeight: number
  reduceMotion?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const [engaged, setEngaged] = React.useState(props.live)
  if (props.live && !engaged) {
    setEngaged(true)
  }
  // Why the delay: the sheets must stay mounted through the exit animation, or the
  // stack pops out of existence instead of folding back into the canvas.
  React.useEffect(() => {
    if (props.live || !engaged) {
      return
    }
    const timer = setTimeout(() => setEngaged(false), props.reduceMotion ? 0 : EXIT_MS)
    return () => clearTimeout(timer)
  }, [props.live, engaged, props.reduceMotion])

  const transition = props.reduceMotion ? 'none' : STAGE_TRANSITION
  return (
    <div
      className="absolute inset-0"
      style={{
        perspective: engaged ? `${floorPerspectivePx(props.stageHeight)}px` : undefined,
        // Why clip-path rather than overflow: the stack is meant to run off the top
        // and bottom of the canvas, and an overflow ancestor becomes scrollable.
        clipPath: engaged ? 'inset(0)' : undefined
      }}
    >
      {engaged ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundColor: 'var(--canvas-floor-scrim)',
              opacity: props.live ? 1 : 0,
              transition
            }}
          />
          {floorsBelow(props.stack).map((item) => (
            <GhostSheet
              key={item.key}
              item={item}
              layer="below"
              visible={props.live}
              reduceMotion={props.reduceMotion ?? false}
            />
          ))}
        </>
      ) : null}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          transformOrigin: 'center center',
          transform: props.live
            ? `translateY(${FLOOR_LIVE_OFFSET_Y}px) scale(${FLOOR_OVERVIEW_SCALE}) rotateX(${FLOOR_TILT_DEGREES}deg)`
            : 'none',
          borderRadius: FLOOR_CORNER_RADIUS,
          transition,
          // Floors above draw in front of the live sheet; the z-index is what keeps
          // that true once the stack is rotated.
          zIndex: 1
        }}
      >
        {props.children}
      </div>
      {engaged ? (
        <div className="absolute inset-0" style={{ zIndex: 2 }}>
          {floorsAbove(props.stack).map((item) => (
            <GhostSheet
              key={item.key}
              item={item}
              layer="above"
              visible={props.live}
              reduceMotion={props.reduceMotion ?? false}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
