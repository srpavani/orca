import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { AgentCanvasGlassButton } from './AgentCanvasGlass'

/**
 * Where the reference's TopBar puts its sidebar button: a round glass button 12px
 * from the top-left. In Orca the canvas is a page, so that corner leads back to
 * the app instead of toggling a sidebar.
 */
export function AgentCanvasBackButton(props: { onBack: () => void }): React.JSX.Element {
  return (
    <div
      className="pointer-events-none absolute z-30 flex items-center gap-2"
      style={{ left: 12, top: 12 }}
    >
      <div className="canvas-glass pointer-events-auto rounded-full p-1">
        <AgentCanvasGlassButton
          label={translate('auto.components.agentCanvas.backToApp', 'Back to app')}
          onClick={props.onBack}
        >
          <ArrowLeft className="size-5" />
        </AgentCanvasGlassButton>
      </div>
    </div>
  )
}
