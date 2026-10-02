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
