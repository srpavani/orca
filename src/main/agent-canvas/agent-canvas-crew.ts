import type { AgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import {
  addNode,
  createSessionNode,
  mapAllLevels,
  removeNode
} from '../../shared/spatial-canvas/document'
import { sessionNode } from '../../shared/spatial-canvas/levels'
import { duplicateSessionLabel } from '../../shared/spatial-canvas/reachability'
import { freeGridSlot } from '../../shared/spatial-canvas/session-placement'
import type { CanvasDocument, CanvasSessionContent } from '../../shared/spatial-canvas/types'
import type { TuiAgent } from '../../shared/tui-agent'
import { AgentCanvasAccessError } from './agent-canvas-peers'
import {
  spawnRecruitTerminal,
  type AgentCanvasRecruitRuntime,
  type RecruitLaunch
} from './agent-canvas-recruit'

export type AgentCanvasCrewRuntime = Omit<AgentCanvasRecruitRuntime, 'listTerminals'> & {
  listTerminals(): Promise<{
    terminals: {
      handle: string
      tabId: string
      connected: boolean
      worktreeId?: string
      agentIdentity?: TuiAgent
    }[]
  }>
  closeTerminalTab(handle: string): Promise<unknown>
}

function labelTaken(document: CanvasDocument, label: string, except: string): boolean {
  return (
    label.trim().toLowerCase() !== except.trim().toLowerCase() &&
    duplicateSessionLabel(document, label)
  )
}

/**
 * Swaps the agent behind a card in place, the reference's `recruit --replace`.
 * Why the card survives: its wires, notes, position and project links are the
 * teammate; only the process restarts, so nobody has to rewire anything.
 */
export async function replaceAgent(input: {
  document: CanvasDocument
  runtime: AgentCanvasCrewRuntime
  sessionId: string
  /** New name; omitted keeps the current one. */
  name?: string
  launch: RecruitLaunch
  /** New role; undefined keeps the current one, null clears it. */
  roleId?: string | null
  signal?: AbortSignal
}): Promise<{ document: CanvasDocument; sessionId: string; label: string; handle: string }> {
  const node = sessionNode(input.document, input.sessionId)
  if (node === null || node.content.kind !== 'session') {
    throw new AgentCanvasAccessError('canvas_peer_not_found', 'That session has no card.')
  }
  const current = node.content
  const label = input.name?.trim() || current.label
  if (labelTaken(input.document, label, current.label)) {
    throw new AgentCanvasAccessError(
      'canvas_label_taken',
      `A session named "${label}" is already on the canvas.`
    )
  }
  const { terminals } = await input.runtime.listTerminals()
  const old = terminals.find((row) => row.tabId === input.sessionId)
  if (!old?.worktreeId) {
    throw new AgentCanvasAccessError(
      'canvas_peer_not_running',
      `"${current.label}" has no running terminal, so there is no workspace to restart it in.`
    )
  }
  const term = await spawnRecruitTerminal(input.runtime, old.worktreeId, input.launch, input.signal)
  const content: CanvasSessionContent = {
    ...current,
    sessionId: term.tabId,
    label,
    name: label,
    roleId: input.roleId === undefined ? current.roleId : input.roleId
  }
  const document = mapAllLevels(input.document, (contents) => ({
    ...contents,
    nodes: contents.nodes.map((candidate) =>
      candidate.id === node.id ? { ...candidate, content } : candidate
    )
  }))
  // Why after the swap: if the new agent never came up, the old one is still working.
  await input.runtime.closeTerminalTab(old.handle).catch(() => undefined)
  return { document, sessionId: term.tabId, label, handle: term.handle }
}

/** Stops a teammate and removes its card, the reference's `dismiss`. */
export async function dismissAgent(input: {
  document: CanvasDocument
  runtime: AgentCanvasCrewRuntime
  sessionId: string
}): Promise<CanvasDocument> {
  const node = sessionNode(input.document, input.sessionId)
  if (node === null) {
    throw new AgentCanvasAccessError('canvas_peer_not_found', 'That session has no card.')
  }
  const { terminals } = await input.runtime.listTerminals()
  const row = terminals.find((candidate) => candidate.tabId === input.sessionId)
  if (row) {
    await input.runtime.closeTerminalTab(row.handle)
  }
  return removeNode(input.document, node.id)
}

/**
 * Recruits into another project, the reference's `recruit --workspace`: the
 * agent runs in that project's checkout and its card lands on that project's
 * board. The caller links to it; there is no wire, since boards never share one.
 */
export async function recruitIntoProject(input: {
  board: AgentCanvasSnapshot
  runtime: AgentCanvasCrewRuntime
  worktreeId: string
  name: string
  launch: RecruitLaunch
  roleId: string | null
  signal?: AbortSignal
}): Promise<{ document: CanvasDocument; sessionId: string; handle: string }> {
  if (duplicateSessionLabel(input.board.document, input.name)) {
    throw new AgentCanvasAccessError(
      'canvas_label_taken',
      `A session named "${input.name}" is already on that project's canvas.`
    )
  }
  const term = await spawnRecruitTerminal(
    input.runtime,
    input.worktreeId,
    input.launch,
    input.signal
  )
  const draft = createSessionNode({
    sessionId: term.tabId,
    label: input.name,
    at: freeGridSlot(input.board.document.root)
  })
  const card = {
    ...draft,
    content: { ...draft.content, name: input.name, roleId: input.roleId }
  }
  return {
    document: addNode(input.board.document, card, null),
    sessionId: term.tabId,
    handle: term.handle
  }
}
