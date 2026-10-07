import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const IDENTITY_NOTE =
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
    usage: 'orca canvas ask <to> <prompt> [--timeout-ms <n>] [--raw <keys>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'to', 'prompt', 'timeout-ms', 'batch', 'raw'],
    positionalArgs: ['to', 'prompt'],
    notes: [
      IDENTITY_NOTE,
      '<to> is the peer label shown on the canvas (case-insensitive) or its session id.',
      'Blocks until the peer goes idle (default 10 minutes) and prints the output it produced.',
      'Fails with canvas_peer_not_connected when no wire joins the two sessions; nothing is sent.',
      '--batch \'{"Peer A": "prompt", "Peer B": "prompt"}\' asks several peers in parallel.',
      'When the peer is waiting on your ask, this message answers it in full instead (ask back).',
      '--raw "2\\n" types keys without waiting: \\n Enter, \\t Tab, \\e Esc, \\xNN a byte (\\x03 Ctrl-C).'
    ],
    examples: [
      'orca canvas ask Backend "Which port does the API listen on?"',
      'orca canvas ask reviewer "Review the diff in src/api" --timeout-ms 900000 --json',
      'orca canvas ask --batch \'{"Backend": "list the routes", "Reviewer": "review the diff"}\''
    ]
  },
  {
    path: ['canvas', 'connect'],
    summary: 'Wire two sessions of your team so they can ask each other',
    usage: 'orca canvas connect <from> <to> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'from', 'to'],
    positionalArgs: ['from', 'to'],
    notes: [
      IDENTITY_NOTE,
      'Each side must be you or a session already wired to you, so the join grants you nothing new.',
      'Sessions on different floors are joined with a bridge.'
    ],
    examples: ['orca canvas connect Reviewer Tester']
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
    path: ['canvas', 'status'],
    summary: 'See what each session you can reach is doing right now',
    usage: 'orca canvas status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      IDENTITY_NOTE,
      'Costs the peers nothing: it samples their terminal output clock, no prompt is sent.',
      'Use it before ask — "working now" means the peer is mid-turn, "idle" means it is done or waiting.',
      'Sessions with Sonar off are listed but marked; no notification is sent for them.'
    ],
    examples: ['orca canvas status', 'orca canvas status --json']
  },
  {
    path: ['canvas', 'watch'],
    summary: 'Turn Sonar on or off for a session (default: this session)',
    usage: 'orca canvas watch [--to <name>] [--off] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'to', 'off'],
    notes: [
      IDENTITY_NOTE,
      'Sonar watches a terminal and tells the user when it falls quiet — done, or waiting on them.',
      'Watched is the default for every session card; --off mutes one (your own card unless --to names another).',
      'Only agents are watched: a plain shell that finishes a command is not "waiting for you".'
    ],
    examples: ['orca canvas watch --off', 'orca canvas watch --to reviewer']
  },
  {
    path: ['canvas', 'floor', 'create'],
    summary: 'Add a floor to the canvas (lead sessions only)',
    usage: 'orca canvas floor create <name> [--branch <branch>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'branch'],
    positionalArgs: ['name'],
    notes: [
      IDENTITY_NOTE,
      'Requires your session to be marked lead on the canvas (the crown on your card): the manager',
      'gate, so a peer agent cannot restructure the board on its own.',
      'With --branch, sessions whose workspace is on that branch land on this floor automatically.',
      'Adds a floor, not a git worktree — creating the isolated checkout stays a user action.'
    ],
    examples: [
      'orca canvas floor create Experiment',
      'orca canvas floor create "Refactor Auth" --branch refactor-auth'
    ]
  },
  {
    path: ['canvas', 'recruit'],
    summary: 'Spawn a new agent terminal on the canvas, named and wired to this session',
    usage:
      'orca canvas recruit <name> [--agent <preset>] [--role <role>] [--command <cmd>] [--prompt <text>] [--cwd <dir>] [--floor <name>] [--project <name>] [--replace <teammate>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'name',
      'agent',
      'command',
      'prompt',
      'cwd',
      'floor',
      'role',
      'project',
      'replace'
    ],
    positionalArgs: ['name'],
    notes: [
      IDENTITY_NOTE,
      'The recruit is created in this session workspace and wired to you, so it is immediately askable.',
      'Recruiting onto another floor (--floor) bridges it instead, since wires never cross floors.',
      'Run `orca canvas peers` first: if a wired session already covers the role, ask it instead of spawning another.',
      'Names must be unique on the canvas; a name is how the team addresses the agent from then on.',
      'The new terminal starts without stealing your focus; its card appears on the canvas.',
      'Without --agent or --command the recruit is a copy of you: the same agent you are running.',
      '--role starts it with that role preset as its standing orders (see `orca canvas role list`).',
      '--project recruits into another project (its sidebar name), linked to you; address it as "Name @ Project".',
      '--replace swaps the agent behind an existing teammate in place: wires, notes and links survive, history does not.'
    ],
    examples: [
      'orca canvas recruit Aurora --agent claude',
      'orca canvas recruit Probe --command "codex --model o3" --floor Experiment',
      'orca canvas recruit Scout --agent claude --prompt "Map the auth flow and report back."',
      'orca canvas recruit Anvil --role "Code Reviewer"',
      'orca canvas recruit Pixel --project frontend --role Designer',
      'orca canvas recruit --agent codex --replace Scout'
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
  },
  {
    path: ['canvas', 'note', 'create'],
    summary: 'Create a note beside this terminal, wired to it',
    usage: 'orca canvas note create [<text>] [--name <name>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'text', 'name'],
    positionalArgs: ['text'],
    notes: [
      IDENTITY_NOTE,
      'The note lands to the left of your card and is wired to you, so you can read and write it at once.',
      '--name pins a name that never changes with the content; the reply prints the exact name to use.'
    ],
    examples: ['orca canvas note create "## Plan" --name Plan']
  },
  {
    path: ['canvas', 'note', 'edit'],
    summary: 'Replace one exact piece of text in a note wired to this terminal',
    usage: 'orca canvas note edit <note> <old> <new> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'note', 'old', 'new'],
    positionalArgs: ['note', 'old', 'new'],
    notes: [
      IDENTITY_NOTE,
      'The old text must appear exactly once; read the note first. Prefer this over write to keep others edits.'
    ],
    examples: ['orca canvas note edit Plan "- [ ] tests" "- [x] tests"']
  }
]
