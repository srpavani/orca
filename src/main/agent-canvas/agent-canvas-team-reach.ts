import { sessionNode } from '../../shared/spatial-canvas/levels'
import type { AgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import type { CrossLinkEnd } from './agent-canvas-cross-links'
import { AgentCanvasAccessError, resolveConnectedPeer } from './agent-canvas-peers'

/** What resolving across projects needs; injected so tests need no Electron. */
export type TeamReachSources = {
  links: { peersOf(end: CrossLinkEnd): { linkId: string; other: CrossLinkEnd }[] }
  boardOf(projectKey: string): AgentCanvasSnapshot
  projectName(projectKey: string): string
}

/** A session on another project's board, wired to the caller by a link. */
export type LinkedPeer = {
  sessionId: string
  /** The label on its own board. */
  label: string
  /** How the caller addresses it: `Label @ Project`, as the reference prints it. */
  address: string
  projectKey: string
  linkId: string
  isLead: boolean
}

export function projectAddress(label: string, projectName: string): string {
  return `${label} @ ${projectName}`
}

export function linkedPeersOf(caller: CrossLinkEnd, sources: TeamReachSources): LinkedPeer[] {
  return sources.links.peersOf(caller).flatMap(({ linkId, other }) => {
    const node = sessionNode(sources.boardOf(other.projectKey).document, other.sessionId)
    if (node === null || node.content.kind !== 'session') {
      return []
    }
    const label = node.content.label
    return [
      {
        sessionId: other.sessionId,
        label,
        address: projectAddress(label, sources.projectName(other.projectKey)),
        projectKey: other.projectKey,
        linkId,
        isLead: node.content.isLead
      }
    ]
  })
}

const norm = (value: string): string => value.trim().toLowerCase()

/**
 * Resolves `target` on the caller's board first, then among its project links.
 * Why the board wins: the reference addresses a linked agent only as
 * `Name @ Workspace`, so a bare name always means a teammate on this board.
 */
export function resolveTeamPeer(
  snapshot: AgentCanvasSnapshot,
  caller: CrossLinkEnd,
  target: string,
  sources: TeamReachSources
): { sessionId: string; label: string; linked: LinkedPeer | null } {
  const linked = linkedPeersOf(caller, sources).filter(
    (peer) => norm(peer.address) === norm(target) || peer.sessionId === target
  )
  if (linked.length === 1) {
    return { sessionId: linked[0].sessionId, label: linked[0].address, linked: linked[0] }
  }
  if (linked.length > 1) {
    throw new AgentCanvasAccessError(
      'canvas_peer_ambiguous',
      `More than one linked session is called "${target}". Rename one on its canvas.`
    )
  }
  const peer = resolveConnectedPeer(snapshot, caller.sessionId, target)
  return { sessionId: peer.sessionId, label: peer.label, linked: null }
}
