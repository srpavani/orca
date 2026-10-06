import React from 'react'
import { translate } from '@/i18n/i18n'
import type { CanvasNode, CanvasPortalContent } from '../../../../shared/spatial-canvas/types'
import {
  CARD_HEADER_HEIGHT,
  PortalControlsBar,
  type CardHeaderDrag
} from './AgentCanvasCardHeaders'

/** Reload requests from outside the card (the portal toolbar's Reload), by node id. */
const reloadListeners = new Map<string, Set<() => void>>()

export function requestCanvasPortalReload(nodeId: string): void {
  for (const listener of reloadListeners.get(nodeId) ?? []) {
    listener()
  }
}

/**
 * A live web page pinned on the canvas (docs, a dev server, a dashboard), under
 * the reference's PortalControlsBar, with its sweeping progress strip while the
 * page loads. Sized in world units: the card scales as a whole, so zoom never
 * relayouts the page. The frame only takes pointer input while its card is
 * selected, otherwise a drag that starts over the page would be swallowed; with
 * the chrome hidden the page itself is the drag handle, as in the reference.
 */
export function AgentCanvasPortalBody(props: {
  node: CanvasNode & { content: CanvasPortalContent }
  interactive: boolean
  drag: CardHeaderDrag
}): React.JSX.Element {
  const { node, interactive } = props
  const [reloadKey, setReloadKey] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const reload = React.useCallback(() => {
    setLoading(true)
    setReloadKey((value) => value + 1)
  }, [])
  React.useEffect(() => {
    const set = reloadListeners.get(node.id) ?? new Set<() => void>()
    set.add(reload)
    reloadListeners.set(node.id, set)
    return () => {
      set.delete(reload)
    }
  }, [node.id, reload])
  React.useEffect(() => setLoading(true), [node.content.url])
  const chrome = node.content.chromeHidden !== true
  const height = Math.max(
    0,
    node.frame.height - (chrome ? CARD_HEADER_HEIGHT.portal + CARD_HEADER_HEIGHT.portalBar : 0)
  )
  return (
    <div className="flex flex-col" style={{ width: node.frame.width }}>
      {chrome ? <PortalControlsBar node={node} onReload={reload} /> : null}
      <div className="relative overflow-hidden" style={{ height }}>
        <iframe
          key={reloadKey}
          title={node.content.url}
          src={node.content.url}
          // Why: a third-party page must never reach the app — cross-origin plus a sandbox
          // without top-navigation keeps it from steering or scripting the Orca window.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
          className="size-full border-0 bg-white"
          style={{ pointerEvents: interactive ? 'auto' : 'none' }}
          onLoad={() => setLoading(false)}
        />
        {!chrome && !interactive ? <div {...props.drag} className="absolute inset-0" /> : null}
        {loading ? (
          <div
            role="progressbar"
            aria-label={translate('auto.components.agentCanvas.portalLoading', 'Loading page')}
            className="absolute inset-x-0 top-0 h-0.5 overflow-hidden"
          >
            <div className="canvas-portal-progress h-full w-1/3 rounded-full bg-canvas-accent" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
