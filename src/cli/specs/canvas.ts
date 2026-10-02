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
    allowedFlags: [...GLOBAL_FLAGS, 'to', 'prompt', 'timeout-ms', 'batch'],
    positionalArgs: ['to', 'prompt'],
    notes: [
      IDENTITY_NOTE,
      '<to> is the peer label shown on the canvas (case-insensitive) or its session id.',
      'Blocks until the peer goes idle (default 10 minutes) and prints the output it produced.',
      'Fails with canvas_peer_not_connected when no wire joins the two sessions; nothing is sent.',
      '--batch \'{"Peer A": "prompt", "Peer B": "prompt"}\' asks several peers in parallel.'
    ],
    examples: [
      'orca canvas ask Backend "Which port does the API listen on?"',
      'orca canvas ask reviewer "Review the diff in src/api" --timeout-ms 900000 --json',
      'orca canvas ask --batch \'{"Backend": "list the routes", "Reviewer": "review the diff"}\''
    ]
  },
  {
    path: ['canvas', 'check'],
    summary: 'Read what a wired session is showing right now, without sending it anything',
    usage: 'orca canvas check <to> [--lines <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'to', 'lines'],
    positionalArgs: ['to'],
    notes: [
      IDENTITY_NOTE,
      'Use this to see whether delegated work finished instead of interrupting the agent with ask.',
      'Returns the tail of the peer terminal; the default is the last 60 lines.'
    ],
    examples: ['orca canvas check reviewer', 'orca canvas check Backend --lines 200 --json']
  },
  {
    path: ['canvas', 'recruit'],
    summary: 'Spawn a new agent terminal on the canvas, named and wired to this session',
    usage:
      'orca canvas recruit <name> [--agent <preset>] [--command <cmd>] [--prompt <text>] [--cwd <dir>] [--floor <name>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'agent', 'command', 'prompt', 'cwd', 'floor'],
    positionalArgs: ['name'],
    notes: [
      IDENTITY_NOTE,
      'The recruit is created in this session workspace and wired to you, so it is immediately askable.',
      'Recruiting onto another floor (--floor) bridges it instead, since wires never cross floors.',
      'Run `orca canvas peers` first: if a wired session already covers the role, ask it instead of spawning another.',
      'Names must be unique on the canvas; a name is how the team addresses the agent from then on.',
      'The new terminal starts without stealing your focus; its card appears on the canvas.'
    ],
    examples: [
      'orca canvas recruit Aurora --agent claude',
      'orca canvas recruit Probe --command "codex --model o3" --floor Experiment',
      'orca canvas recruit Scout --agent claude --prompt "Map the auth flow and report back."'
    ]
  },
  {
    path: ['canvas', 'notify'],
    summary: 'Send the user a desktop notification',
    usage: 'orca canvas notify <message> [--title <title>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'message', 'title'],
    positionalArgs: ['message'],
    notes: [
      'Use only when the user explicitly asked to be notified; they are otherwise watching the canvas.',
      'Keep it to one line: what finished, and what they should look at.'
    ],
    examples: ['orca canvas notify "The release branch is green; ready for review."']
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
