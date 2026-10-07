import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { IDENTITY_NOTE } from './canvas'

/** Team management from the reference: dismiss, presets and role presets. */
export const CANVAS_CREW_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['canvas', 'dismiss'],
    summary: 'Stop a teammate and remove its card',
    usage: 'orca canvas dismiss <name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'to'],
    positionalArgs: ['to'],
    notes: [
      IDENTITY_NOTE,
      'Only teammates wired or linked to you. Notes wired only to it become unreachable from the CLI.',
      'To swap its agent instead, use `recruit --replace`, which keeps the card and its wires.'
    ],
    examples: ['orca canvas dismiss Reviewer']
  },
  {
    path: ['canvas', 'preset', 'list'],
    summary: 'List the agent presets a recruit can run',
    usage: 'orca canvas preset list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Pass an id to `recruit --agent`. The one marked "you" is what a recruit copies by default.'
    ]
  },
  {
    path: ['canvas', 'role', 'list'],
    summary: 'List role presets for recruits: this project first, then global',
    usage: 'orca canvas role list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [IDENTITY_NOTE]
  },
  {
    path: ['canvas', 'role', 'show'],
    summary: "Print a role's full prompt",
    usage: 'orca canvas role show <name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name'],
    positionalArgs: ['name'],
    notes: [IDENTITY_NOTE]
  },
  {
    path: ['canvas', 'role', 'create'],
    summary: 'Add a role preset that recruits can be started with',
    usage: 'orca canvas role create <name> <prompt> [--scope current|global] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'prompt', 'scope'],
    positionalArgs: ['name', 'prompt'],
    notes: [
      IDENTITY_NOTE,
      'Roles are scoped to this project by default; use --scope global for roles that fit any project.',
      'Tell the role to run `orca canvas peers` first, and name the peers and notes it should use.'
    ],
    examples: [
      'orca canvas role create "Code Reviewer" "Review for correctness; never edit files." --scope global'
    ]
  },
  {
    path: ['canvas', 'role', 'edit'],
    summary: "Replace text in a role's prompt, or change its scope",
    usage: 'orca canvas role edit <name> [<old> <new>] [--scope current|global] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'old', 'new', 'scope'],
    positionalArgs: ['name', 'old', 'new'],
    notes: [
      IDENTITY_NOTE,
      'Running teammates keep the old prompt until `role assign` restarts them.'
    ],
    examples: [
      'orca canvas role edit Reviewer "never edit" "do not edit"',
      'orca canvas role edit Reviewer --scope global'
    ]
  },
  {
    path: ['canvas', 'role', 'write'],
    summary: "Replace a role's prompt entirely",
    usage: 'orca canvas role write <name> <prompt> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'prompt'],
    positionalArgs: ['name', 'prompt'],
    notes: [IDENTITY_NOTE]
  },
  {
    path: ['canvas', 'role', 'delete'],
    summary: 'Delete a role preset',
    usage: 'orca canvas role delete <name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name'],
    positionalArgs: ['name'],
    notes: [
      IDENTITY_NOTE,
      'Teammates already running it keep working; their card just loses the role name.'
    ]
  },
  {
    path: ['canvas', 'role', 'assign'],
    summary: 'Restart a teammate into a role, keeping its card and wires',
    usage: 'orca canvas role assign <teammate> <role> | --none [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'to', 'role', 'none'],
    positionalArgs: ['to', 'role'],
    notes: [
      IDENTITY_NOTE,
      'The agent restarts so it boots into the role; its chat history does not survive.',
      '--none clears the role.'
    ],
    examples: [
      'orca canvas role assign Anvil "Product Manager"',
      'orca canvas role assign Anvil --none'
    ]
  }
]
