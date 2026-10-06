import React from 'react'

/** The reference's MAIN_TOOLBAR_TOP, MAIN_TOOLBAR_HEIGHT and CONTEXTUAL_GAP. */
const MAIN_TOOLBAR_TOP = 12
const MAIN_TOOLBAR_HEIGHT = 36
const CONTEXTUAL_GAP = 8
const CONTEXTUAL_TOOLBAR_TOP = MAIN_TOOLBAR_TOP + MAIN_TOOLBAR_HEIGHT + CONTEXTUAL_GAP

/**
 * The reference's TopChrome: the main toolbar centred 12px from the top, and the
 * contextual toolbar (the selected card's, or the draw tools) centred 8px under
 * it. The contextual one drops in with the reference's spring — y -24 → 0 and
 * scale .9 → 1 overshooting (visualDuration .3, bounce .4) while opacity fades
 * on its own .15s tween — and leaves to y -8, scale .96. Keyed by `contextKey`
 * so switching from one card's toolbar to another's replays the entrance.
 */
export function AgentCanvasTopChrome(props: {
  main: React.ReactNode
  contextual: React.ReactNode
  contextKey: string | null
}): React.JSX.Element {
  const [leaving, setLeaving] = React.useState<{ key: string; node: React.ReactNode } | null>(null)
  const shown = React.useRef<{ key: string; node: React.ReactNode } | null>(null)

  React.useLayoutEffect(() => {
    const previous = shown.current
    if (previous && previous.key !== props.contextKey) {
      setLeaving(previous)
    }
    shown.current =
      props.contextual && props.contextKey
        ? { key: props.contextKey, node: props.contextual }
        : null
  }, [props.contextKey, props.contextual])

  return (
    <div className="contents" data-canvas-toolbar-gradient="">
      <div
        className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3"
        style={{ top: MAIN_TOOLBAR_TOP }}
      >
        <div className="pointer-events-auto">{props.main}</div>
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3"
        style={{ top: CONTEXTUAL_TOOLBAR_TOP }}
      >
        <div className="grid">
          {leaving && leaving.key !== props.contextKey ? (
            <div
              key={`out-${leaving.key}`}
              className="canvas-contextual-out pointer-events-none col-start-1 row-start-1 min-w-0 max-w-full"
              onAnimationEnd={() => setLeaving(null)}
            >
              {leaving.node}
            </div>
          ) : null}
          {props.contextual && props.contextKey ? (
            <div
              key={`in-${props.contextKey}`}
              className="canvas-contextual-in pointer-events-auto col-start-1 row-start-1 min-w-0 max-w-full"
            >
              {props.contextual}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
