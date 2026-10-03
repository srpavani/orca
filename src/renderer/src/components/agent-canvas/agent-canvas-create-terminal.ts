import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { getAgentCanvasState, placeCanvasSessionAt } from './agent-canvas-store'
import { openCanvasPrompt } from './agent-canvas-prompt'
import { floorWorktreeIdFrom } from './agent-canvas-repo'

export type CanvasTerminalPreset = {
  /** Omitted runs the user's default shell. */
  agent?: TuiAgent
  label: string
}

/** The reference's quick-start row, in the same order. */
export const CANVAS_TERMINAL_PRESETS: readonly CanvasTerminalPreset[] = [
  { label: 'Shell' },
  { agent: 'claude', label: 'Claude Code' },
  { agent: 'codex', label: 'Codex' },
  { agent: 'antigravity', label: 'Antigravity' },
  { agent: 'opencode', label: 'OpenCode' }
]

/** Everything the new-terminal form can decide. */
export type CanvasTerminalSpec = {
  /** Canvas name for the terminal; also what the tab is titled from. */
  name?: string
  agent?: TuiAgent
  /** Shell command; ignored when `agent` is set. */
  command?: string
  cwd?: string
  /** First instruction handed to the launched agent. */
  prompt?: string
  /** Chat view instead of the terminal view. */
  chat?: boolean
}

const LOCAL_RUNTIME = { kind: 'local' } as const

export type CanvasTerminalCreated = {
  sessionId: string
  /** id of the card placed, so the caller can set its flags. */
  nodeId: string | null
}

/**
 * Creates a terminal in the workspace the board is showing and places its card.
 * Returns null when it could not be created, so the caller keeps the form open.
 */
export async function createCanvasTerminal(
  spec: CanvasTerminalSpec
): Promise<CanvasTerminalCreated | null> {
  // Why the floor decides: a terminal belongs to the floor it is created on, so it
  // runs in that floor's checkout — not in whichever worktree the sidebar last had.
  const { document, activeLevelId } = getAgentCanvasState()
  const floorBranch = document.levels.find((level) => level.id === activeLevelId)?.branch ?? null
  const worktreeId = floorWorktreeIdFrom(useAppStore.getState(), floorBranch)
  if (!worktreeId) {
    openCanvasPrompt({
      kind: 'notice',
      title: translate(
        'auto.components.agentCanvas.noWorkspace',
        'Open a workspace first — a terminal needs somewhere to run.'
      ),
      confirmLabel: translate('auto.components.agentCanvas.ok', 'OK'),
      onSubmit: () => {}
    })
    return null
  }
  try {
    const created = await callRuntimeRpc<{ tab?: { id?: string; title?: string | null } }>(
      LOCAL_RUNTIME,
      'session.tabs.createTerminal',
      {
        worktree: `id:${worktreeId}`,
        activate: true,
        select: true,
        ...(spec.agent ? { agent: spec.agent } : {}),
        // Why command is dropped when an agent is chosen: a preset's own command
        // is what launches the agent, and two commands cannot share one shell.
        ...(!spec.agent && spec.command ? { command: spec.command } : {}),
        ...(spec.cwd ? { cwd: spec.cwd } : {}),
        ...(spec.prompt ? { agentPrompt: spec.prompt } : {}),
        ...(spec.chat ? { viewMode: 'chat' as const } : {})
      },
      // Spawning a PTY is slower than a read; leave room for it to come up.
      { timeoutMs: 60_000 }
    )
    const sessionId = created?.tab?.id
    if (typeof sessionId !== 'string') {
      return null
    }
    // Why place it here rather than let the sync file it: the sync puts a session on
    // its branch's floor, so a terminal created while looking at another floor would
    // land out of sight. The board asked for it; the board should show it.
    const label = spec.name?.trim() || created?.tab?.title?.trim() || spec.agent || 'Terminal'
    const nodeId = placeCanvasSessionAt(sessionId, label, getAgentCanvasState().activeLevelId)
    return { sessionId, nodeId }
  } catch (error) {
    openCanvasPrompt({
      kind: 'notice',
      title: translate(
        'auto.components.agentCanvas.terminalCreateFailed',
        'The terminal could not be created.'
      ),
      description: error instanceof Error ? error.message : undefined,
      confirmLabel: translate('auto.components.agentCanvas.ok', 'OK'),
      onSubmit: () => {}
    })
    return null
  }
}
