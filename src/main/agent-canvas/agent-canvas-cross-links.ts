import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  hardenExistingSecureFile,
  isUnreadableError,
  writeSecureJsonFile
} from '../../shared/secure-file'
import { PROJECT_CANVAS_DIRNAME } from './agent-canvas-store'
import { jsonField } from './agent-canvas-roles'

export const CROSS_LINKS_FILENAME = 'cross-links.json'

export type CrossLinkEnd = { projectKey: string; sessionId: string }
export type CrossLink = { id: string; a: CrossLinkEnd; b: CrossLinkEnd; createdAt: string }

const sameEnd = (left: CrossLinkEnd, right: CrossLinkEnd): boolean =>
  left.projectKey === right.projectKey && left.sessionId === right.sessionId

function parseEnd(raw: unknown): CrossLinkEnd | null {
  const projectKey = jsonField(raw, 'projectKey')
  const sessionId = jsonField(raw, 'sessionId')
  return typeof projectKey === 'string' && typeof sessionId === 'string'
    ? { projectKey, sessionId }
    : null
}

function parseLinks(raw: unknown): CrossLink[] {
  const rows = jsonField(raw, 'links')
  if (!Array.isArray(rows)) {
    return []
  }
  return rows.flatMap((row: unknown) => {
    const id = jsonField(row, 'id')
    const createdAt = jsonField(row, 'createdAt')
    const a = parseEnd(jsonField(row, 'a'))
    const b = parseEnd(jsonField(row, 'b'))
    return typeof id === 'string' && a && b
      ? [{ id, a, b, createdAt: typeof createdAt === 'string' ? createdAt : '' }]
      : []
  })
}

/**
 * Wires between sessions on different projects' boards, the reference's
 * cross-workspace connections. Why outside both boards: neither project owns
 * the wire, and cutting it on either side must cut it for both.
 * Like a wire, a link is exactly one hop of permission.
 */
export class AgentCanvasCrossLinks {
  private readonly path: string
  private links: CrossLink[]
  private readonly unreadable: boolean

  constructor(userDataPath: string) {
    this.path = join(userDataPath, PROJECT_CANVAS_DIRNAME, CROSS_LINKS_FILENAME)
    let links: CrossLink[] = []
    let unreadable = false
    try {
      hardenExistingSecureFile(this.path)
      links = parseLinks(JSON.parse(readFileSync(this.path, 'utf8')))
    } catch (error) {
      unreadable = isUnreadableError(error)
    }
    this.links = links
    this.unreadable = unreadable
  }

  /** The far ends linked to `end`. */
  peersOf(end: CrossLinkEnd): { linkId: string; other: CrossLinkEnd }[] {
    return this.links.flatMap((link) =>
      sameEnd(link.a, end)
        ? [{ linkId: link.id, other: link.b }]
        : sameEnd(link.b, end)
          ? [{ linkId: link.id, other: link.a }]
          : []
    )
  }

  /** Every link touching `projectKey`, so its board can draw and cut them. */
  touching(projectKey: string): CrossLink[] {
    return this.links.filter(
      (link) => link.a.projectKey === projectKey || link.b.projectKey === projectKey
    )
  }

  add(a: CrossLinkEnd, b: CrossLinkEnd, now: string): CrossLink {
    const existing = this.links.find(
      (link) =>
        (sameEnd(link.a, a) && sameEnd(link.b, b)) || (sameEnd(link.a, b) && sameEnd(link.b, a))
    )
    if (existing) {
      return existing
    }
    const link = { id: randomUUID(), a, b, createdAt: now }
    this.save([...this.links, link])
    return link
  }

  remove(linkId: string): boolean {
    const next = this.links.filter((link) => link.id !== linkId)
    if (next.length === this.links.length) {
      return false
    }
    this.save(next)
    return true
  }

  /** A dismissed session's links go with it; a stale link would point at nobody. */
  forgetSession(end: CrossLinkEnd): void {
    const next = this.links.filter((link) => !sameEnd(link.a, end) && !sameEnd(link.b, end))
    if (next.length !== this.links.length) {
      this.save(next)
    }
  }

  /** A replaced agent keeps its links: the card is the same teammate, on a new process. */
  renameSession(from: CrossLinkEnd, toSessionId: string): void {
    const move = (end: CrossLinkEnd): CrossLinkEnd =>
      sameEnd(end, from) ? { ...end, sessionId: toSessionId } : end
    const next = this.links.map((link) => ({ ...link, a: move(link.a), b: move(link.b) }))
    this.save(next)
  }

  private save(links: CrossLink[]): void {
    this.links = links
    if (!this.unreadable) {
      writeSecureJsonFile(this.path, { links })
    }
  }
}
