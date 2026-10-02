---
name: agent-canvas
description: >-
  Talk to the other agents and notes the user wired to your terminal on Orca's Agent
  Canvas: list who you are connected to, ask a connected agent a question and wait
  for its answer, and read or write shared notes. Use when the user mentions the
  canvas, a connected/wired agent or session by name ("ask Backend", "check with the
  reviewer"), or a canvas note ("update the Plan note"). Use `orchestration` instead
  for supervised task DAGs and worker dispatch.
---

# Agent Canvas

`ORCA` is a placeholder for the executable you resolved in the stub; substitute it before running.

The user arranges terminal sessions on a spatial canvas and draws wires between them. **A wire
is the permission.** You can only reach what is wired to *your* terminal:

- **Sessions are one hop.** You can ask a session only if a wire joins it directly to you. A
  session wired to one of your peers is not reachable through that peer.
- **Notes chain.** A note wired to you is yours, and so is every note wired to that note, and so
  on. Treat a chain as one shared document.
- Cutting a wire revokes access immediately; the next command against that peer fails.
- **Floors.** The canvas has floors, usually one per git branch/worktree. Wires stay on one
  floor; the user joins sessions on different floors with a **bridge**. A bridge counts exactly
  like a wire (one hop), so a bridged peer shows up in `peers` like any other.

Your terminal is put on the canvas automatically the first time you run any `canvas` command
(on the floor pinned to your branch, if there is one). Being placed grants nothing: until the
user wires or bridges you to someone, `sessions` is empty.

Your identity comes from the terminal you run in (`ORCA_TERMINAL_HANDLE`). Always run these
commands from your own Orca terminal; never pass another session's identity.

## Start every canvas task with `peers`

```text
ORCA canvas peers --json
```

Returns `self` (your label), `sessions` (who you may ask), and `notes` (each with `noteId`,
`displayName`, `depth` in the chain, `readOnly`, and the full `body`). Address peers by the
`label` shown here and notes by `displayName` or `noteId`. Do not guess names.

If `sessions` is empty, nobody is wired to you. Tell the user which session you need and ask them
to draw a wire on the Agent Canvas (or a bridge, if that session is on another floor); do not try
to reach other terminals some other way.

## Ask a connected agent

```text
ORCA canvas ask <label> "<question>" --json
```

The prompt is typed into the peer's agent, prefixed with your label so it knows who is asking.
The command blocks until the peer's turn finishes (default 10 minutes; raise with
`--timeout-ms <n>` for long work), then returns `reply`: the text the peer produced after your
prompt, with terminal escapes stripped.

- `settled: false` (exit code 1) means the peer did not finish: it timed out or stopped on a
  prompt it needs a human for (`blockedReason`, e.g. an approval). Do not resend. Tell the user
  the peer is waiting and what it is waiting on.
- Make each ask self-contained: the peer has its own context and does not see yours. Include the
  file paths, the exact question, and the form you want the answer in.
- Ask one thing at a time. A peer working on its own task is interrupted by your ask; keep asks
  short and only when you need the answer to continue.
- The reply is the peer's terminal output, so it may contain tool chatter. Extract the answer;
  if it is unclear, ask a narrower follow-up instead of guessing.

Ask several peers at once with a JSON map; the replies come back per peer and the call costs the
slowest one, not the sum:

```text
ORCA canvas ask --batch '{"Backend": "list the routes", "Reviewer": "review the diff"}' --json
```

## See what a peer is doing without interrupting it

```text
ORCA canvas status --json
ORCA canvas check <label> [--lines <n>] --json
```

`status` lists every session you can reach as `working`, `idle` (with how long it has been silent) or
`terminal closed`, and costs the peers nothing — it samples their terminal output instead of sending
them anything. Read it before asking, or before deciding to wait.

`check` reads one peer's current screen. Use either to see whether the work you delegated has
finished; an `ask` interrupts whatever that agent is doing.

## Sonar: when the user hears from you

The canvas watches agents and tells the user when one falls quiet — finished, or waiting on them.
That is the eye on a card, and it is on by default. Mute your own card while you do something the
user does not need to hear about, or re-watch a peer:

```text
ORCA canvas watch --off --json
ORCA canvas watch <label> --json
```

Only agents are watched: a plain shell that finishes a command is not "waiting for you". When you
want to say something specific instead, use `ORCA canvas notify "<message>"`.

## Grow the team

```text
ORCA canvas recruit <name> [--agent <preset>] [--prompt "<text>"] [--command "<cmd>"] [--floor <name>] --json
```

Spawns a new agent terminal in your workspace, names it, and wires it to you, so it is immediately
askable. Use it when the work genuinely needs a teammate that does not exist yet:

- **Look before you recruit.** Run `peers` first. If a wired session already covers the job, `ask`
  it — a recruit costs the user a terminal and a model session.
- **Name it yourself**, short and distinctive. The name is how the team addresses it from then on,
  and it must be unique on the canvas (`canvas_label_taken`). Do not name it after its role.
- `--floor` places it on another floor (see the floor list at the end of `peers`), still reachable
  from you; without it the recruit lands on your own floor.
- `--prompt` hands the new agent its first instruction, which is usually cheaper than recruiting
  blank and asking afterwards.

## Floors, and who may change the board

```text
ORCA canvas floor create <name> [--branch <branch>] --json
```

Adds a floor. This one is gated: your session must be marked **lead** — the crown on your card —
which only the user turns on. Without it you get `canvas_not_lead`. Tell the user what you were
trying to do and let them decide; do not look for another way in. With `--branch`, sessions whose
workspace is on that branch land on that floor by themselves.

Creating the isolated git worktree behind a floor stays a user action in the canvas UI.

## Notify the user

```text
ORCA canvas notify "<message>" --json
```

Sends a desktop notification. Only when the user asked to be told, or when work finished long
after they stopped watching. One line: what finished, and what to look at.

## Shared notes

```text
ORCA canvas note read <name> --json
ORCA canvas note write <name> "<text>" --json
ORCA canvas note write <name> "<text>" --append --json
```

`write` replaces the body; `--append` adds a line. Use `\n` inside the argument for line breaks.
Read-only notes refuse writes (`canvas_note_read_only`); report that instead of working around
it.

Notes are the durable channel between agents and with the user. Use them for plans, decisions,
interface contracts, and status that more than one session needs. Before replacing a note,
read it: another agent or the user may have changed it since you last looked. Prefer `--append`
for logs and status lines so concurrent writers do not erase each other.

## Errors

| Code | Meaning | What to do |
| --- | --- | --- |
| `canvas_caller_not_on_canvas` | Orca could not identify your terminal. | Run the command from your own Orca terminal, not a detached shell. |
| `canvas_peer_not_connected` | The peer exists but no wire joins you. | Ask the user to draw the wire. Nothing was sent. |
| `canvas_peer_not_found` | No session has that label. | Re-run `peers` and use an exact label. |
| `canvas_peer_ambiguous` | Two wired peers share the label. | Use the peer's `sessionId` from `peers`. |
| `canvas_peer_not_running` | The peer's terminal is closed. | Tell the user; do not start one yourself. |
| `canvas_note_not_connected` / `canvas_note_not_found` | The note is not in your chain. | Re-run `peers`; ask the user to wire it. |
| `canvas_note_read_only` | The user locked the note. | Report it; do not copy it elsewhere to edit. |
| `canvas_label_taken` | A session already has that name. | Pick another name, or ask the existing session. |
| `canvas_floor_not_found` | No floor has that name. | Re-run `peers` and use a floor from its list. |
| `canvas_recruit_failed` | The terminal could not be spawned or did not come up. | Report it; do not retry in a loop. |
| `canvas_not_lead` | Adding a floor needs a lead session. | Ask the user to mark you lead; do not work around it. |
| `canvas_floor_exists` | A floor already has that name. | Use the existing floor, or pick another name. |
