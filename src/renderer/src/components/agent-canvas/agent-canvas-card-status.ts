import type { AgentStatusState } from '../../../../shared/agent-status-types'
import type { CanvasNode } from '../../../../shared/spatial-canvas/types'
import type { TerminalLayoutSnapshot } from '../../../../shared/terminal-tab-types'
import { canvasPaneKey } from './agent-canvas-live-panes'

/** What a card shows about its agent: Orca's own status, not a second guess. */
export type CardAgentState = AgentStatusState | 'unknown'

/** The slice of an agent-status entry a card needs; the full entry carries much more. */
export type CardAgentStatus = { state: AgentStatusState }

export function cardAgentState(status: CardAgentStatus | undefined): CardAgentState {
  return status?.state ?? 'unknown'
}

/**
 * Orca's live agent status for a session card, resolved through the tab's
 * active pane. Sonar's notifications come from the host's own sampling; this is
 * the same information the rest of Orca shows, so the card agrees with the tab
 * bar and the activity page instead of inventing a parallel truth.
 */
export function agentStatusForNode(
  node: CanvasNode,
  layouts: Readonly<Record<string, TerminalLayoutSnapshot | undefined>>,
  statusByPaneKey: Readonly<Record<string, CardAgentStatus>>
): CardAgentStatus | undefined {
  if (node.content.kind !== 'session') {
    return undefined
  }
  const paneKey = canvasPaneKey(node.content.sessionId, layouts[node.content.sessionId])
  return paneKey === null ? undefined : statusByPaneKey[paneKey]
}
