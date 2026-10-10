import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const LOBO_GUARA_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['loboguara'],
    argumentMode: 'passthrough',
    summary: 'Start Claude Code on your Lobo-Guará subscription',
    usage: 'orca loboguara [claude args...] | orca loboguara logout',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'The first run opens the browser to sign in to Lobo-Guará; the token is kept in the OS keychain.',
      'Passes all following arguments through to Claude Code. A plain `claude` keeps its own sign-in.'
    ],
    examples: ['orca loboguara', 'orca loboguara --resume <session-id>', 'orca loboguara logout']
  }
]
