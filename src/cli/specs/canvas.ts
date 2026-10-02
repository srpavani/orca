import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const IDENTITY_NOTE =
  'Run from an Orca terminal: the caller is identified by ORCA_TERMINAL_HANDLE, so only wires drawn to this session count.'

export const CANVAS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['canvas', 'peers'],
    summary: 'List the sessions and notes wired to this terminal on the Agent Canvas',
    usage: 'orca canvas peers [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      IDENTITY_NOTE,
      'Sessions are one hop: a peer of a peer is not listed and cannot be asked.',
      'Notes are transitive: a note wired to a note you can see is also yours to read.'
    ]
  },
  {
    path: ['canvas', 'ask'],
    summary: 'Ask a wired session a question and wait for its reply',
    usage: 'orca canvas ask <to> <prompt> [--timeout-ms <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'to', 'prompt', 'timeout-ms'],
    positionalArgs: ['to', 'prompt'],
    notes: [
      IDENTITY_NOTE,
      '<to> is the peer label shown on the canvas (case-insensitive) or its session id.',
      'Blocks until the peer goes idle (default 10 minutes) and prints the output it produced.',
      'Fails with canvas_peer_not_connected when no wire joins the two sessions; nothing is sent.'
    ],
    examples: [
      'orca canvas ask Backend "Which port does the API listen on?"',
      'orca canvas ask reviewer "Review the diff in src/api" --timeout-ms 900000 --json'
    ]
  },
  {
    path: ['canvas', 'note', 'read'],
    summary: 'Read a note wired to this terminal',
    usage: 'orca canvas note read <note> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'note'],
    positionalArgs: ['note'],
    notes: [IDENTITY_NOTE, '<note> is the note name from `canvas peers` or its note id.']
  },
  {
    path: ['canvas', 'note', 'write'],
    summary: 'Replace or append to a note wired to this terminal',
    usage: 'orca canvas note write <note> <text> [--append] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'note', 'text', 'append'],
    positionalArgs: ['note', 'text'],
    notes: [
      IDENTITY_NOTE,
      'Replaces the note body unless --append is given. Read-only notes refuse writes.'
    ],
    examples: [
      'orca canvas note write Plan "1. add endpoint\\n2. add test"',
      'orca canvas note write Plan "3. done: endpoint" --append'
    ]
  }
]
