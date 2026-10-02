import React from 'react'
import { ExternalLink, RotateCw } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { CanvasNode, CanvasPortalContent } from '../../../../shared/spatial-canvas/types'

const HEADER_HEIGHT = 30

/**
 * A live web page pinned on the canvas (docs, a dev server, a dashboard).
 * Sized in world units: the card scales as a whole, so zoom never relayouts the
 * page. The frame only takes pointer input while its card is selected, otherwise
 * a drag that starts over the page would be swallowed instead of panning.
 */
export function AgentCanvasPortalBody(props: {
  node: CanvasNode & { content: CanvasPortalContent }
  interactive: boolean
}): React.JSX.Element {
  const { node, interactive } = props
  const [reloadKey, setReloadKey] = React.useState(0)
  const width = node.frame.width
  const height = Math.max(0, node.frame.height - HEADER_HEIGHT)
  return (
    <div className="relative overflow-hidden" style={{ width, height }}>
      <iframe
        key={reloadKey}
        title={node.content.url}
        src={node.content.url}
        // Why: a third-party page must never reach the app — cross-origin plus a sandbox
        // without top-navigation keeps it from steering or scripting the Orca window.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
        className="size-full border-0 bg-background"
        style={{ pointerEvents: interactive ? 'auto' : 'none' }}
      />
      <div className="absolute right-1 top-1 flex gap-1 opacity-70 hover:opacity-100">
        <button
          type="button"
          className="rounded bg-muted p-1 text-muted-foreground hover:text-foreground"
          aria-label={translate('auto.components.agentCanvas.portalReload', 'Reload page')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setReloadKey((value) => value + 1)}
        >
          <RotateCw className="size-3" />
        </button>
        <button
          type="button"
          className="rounded bg-muted p-1 text-muted-foreground hover:text-foreground"
          aria-label={translate(
            'auto.components.agentCanvas.portalOpenExternal',
            'Open in browser'
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void window.api.shell.openUrl(node.content.url)}
        >
          <ExternalLink className="size-3" />
        </button>
      </div>
    </div>
  )
}
