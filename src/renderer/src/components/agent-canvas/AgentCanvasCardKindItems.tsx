import React from 'react'
import { Settings2 } from 'lucide-react'
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import { elementDefaultChoices } from '../../../../shared/spatial-canvas/element-defaults'
import { useAgentCanvas } from './agent-canvas-store'
import { translate } from '@/i18n/i18n'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import { adoptElementDefault } from './agent-canvas-group-actions'

/**
 * The reference's NewElementDefaultsMenu: adopt this card's size (and a note's
 * colour) for the cards created after it. Items that would change nothing are
 * disabled, as there.
 */
export function AgentCanvasElementDefaultsItems(props: {
  node: CanvasNode
}): React.JSX.Element | null {
  const defaults = useAgentCanvas((state) => state.document.elementDefaults) ?? {}
  const choices = elementDefaultChoices(props.node, defaults)
  if (choices.length === 0) {
    return null
  }
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Settings2 />
        {translate('auto.components.agentCanvas.newElementDefaultsMenu', 'New Element Defaults')}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {choices.map((choice) => (
          <ContextMenuItem
            key={choice.kind}
            disabled={choice.current}
            onSelect={() => adoptElementDefault(choice)}
          >
            {choice.kind === 'size'
              ? translate('auto.components.agentCanvas.useThisSizeMenu', 'Use This Size')
              : translate('auto.components.agentCanvas.useThisColorMenu', 'Use This Color')}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
