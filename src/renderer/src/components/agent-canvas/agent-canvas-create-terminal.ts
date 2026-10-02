import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { openCanvasPrompt } from './agent-canvas-prompt'

export type CanvasTerminalPreset = {
  /** Omitted runs the user's default shell. */
  agent?: TuiAgent
  label: string
}

/** The quick-start list from the reference's Add → New Terminal menu. */
export const CANVAS_TERMINAL_PRESETS: readonly CanvasTerminalPreset[] = [
  { label: 'Shell' },
  { agent: 'claude', label: 'Claude Code' },
  { agent: 'codex', label: 'Codex' },
  { agent: 'antigravity', label: 'Antigravity' },
  { agent: 'opencode', label: 'OpenCode' }
]

const LOCAL_RUNTIME = { kind: 'local' } as const

/**
 * Creates a terminal in the workspace the board is showing. The canvas places a
 * card for it on its own (the background sync watches the tab list), so nothing
 * here has to know about nodes — this only has to make the terminal exist.
 */
export async function createCanvasTerminal(preset: CanvasTerminalPreset): Promise<void> {
  const worktreeId = useAppStore.getState().activeWorktreeId
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
    return
  }
  try {
    await callRuntimeRpc(
      LOCAL_RUNTIME,
      'session.tabs.createTerminal',
      {
        worktree: `id:${worktreeId}`,
        activate: true,
        select: true,
        ...(preset.agent ? { agent: preset.agent } : {})
      },
      // Spawning a PTY is slower than a read; leave room for it to come up.
      { timeoutMs: 60_000 }
    )
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
  }
}
