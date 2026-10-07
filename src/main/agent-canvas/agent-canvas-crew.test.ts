import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addNode,
  connectNodes,
  createDocument,
  createSessionNode
} from '../../shared/spatial-canvas/document'
import { emptyAgentCanvasSnapshot } from '../../shared/spatial-canvas/agent-canvas-snapshot'
import { everyEdge, sessionNode } from '../../shared/spatial-canvas/levels'
import { dismissAgent, replaceAgent, type AgentCanvasCrewRuntime } from './agent-canvas-crew'
import { AgentCanvasCrossLinks } from './agent-canvas-cross-links'
import { spawnRecruitTerminal } from './agent-canvas-recruit'
import { AgentCanvasRoleStore, roleBriefing } from './agent-canvas-roles'
import { linkedPeersOf, resolveTeamPeer } from './agent-canvas-team-reach'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-canvas-crew-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

let next = 0
const id = (): string => `n${++next}`
const AT = { x: 0, y: 0 }

/** Lead wired to Scout; Scout runs in wt-1. */
function team() {
  const lead = createSessionNode({ sessionId: 'lead', label: 'Lead', at: AT, id })
  const scout = createSessionNode({ sessionId: 'scout', label: 'Scout', at: AT, id })
  const document = connectNodes(
    addNode(addNode(createDocument(), lead), scout),
    lead.id,
    scout.id,
    'now',
    id
  )!.document
  return { ...emptyAgentCanvasSnapshot(), document }
}

function fakeRuntime(rows: { handle: string; tabId: string }[]) {
  const live = [...rows]
  const closed: string[] = []
  const runtime: AgentCanvasCrewRuntime = {
    createMobileSessionTerminal: vi.fn(async () => {
      live.push({ handle: 'term_new', tabId: 'tab-new' })
      return { tab: { terminal: null } }
    }),
    listTerminals: async () => ({
      terminals: live.map((row) => ({ ...row, connected: true, worktreeId: 'wt-1' }))
    }),
    closeTerminalTab: async (handle: string) => {
      closed.push(handle)
    }
  }
  return { runtime, closed }
}

describe('replaceAgent', () => {
  it('swaps the process behind a card, keeping its wires', async () => {
    const snapshot = team()
    const { runtime, closed } = fakeRuntime([
      { handle: 'term_lead', tabId: 'lead' },
      { handle: 'term_scout', tabId: 'scout' }
    ])
    const swapped = await replaceAgent({
      document: snapshot.document,
      runtime,
      sessionId: 'scout',
      launch: { agent: 'codex' },
      roleId: 'role-1'
    })
    expect(swapped).toMatchObject({ sessionId: 'tab-new', label: 'Scout' })
    expect(sessionNode(swapped.document, 'scout')).toBeNull()
    const card = sessionNode(swapped.document, 'tab-new')!
    expect(card.content).toMatchObject({ label: 'Scout', roleId: 'role-1' })
    expect(everyEdge(swapped.document)).toHaveLength(1)
    expect(closed).toEqual(['term_scout'])
  })
})

describe('dismissAgent', () => {
  it('closes the terminal and drops the card with its wires', async () => {
    const { runtime, closed } = fakeRuntime([{ handle: 'term_scout', tabId: 'scout' }])
    const document = await dismissAgent({ document: team().document, runtime, sessionId: 'scout' })
    expect(sessionNode(document, 'scout')).toBeNull()
    expect(everyEdge(document)).toHaveLength(0)
    expect(closed).toEqual(['term_scout'])
  })
})

describe('spawnRecruitTerminal', () => {
  it('without a handle, waits for a tab that did not exist before', async () => {
    const { runtime } = fakeRuntime([{ handle: 'term_lead', tabId: 'lead' }])
    await expect(spawnRecruitTerminal(runtime, 'wt-1', {})).resolves.toEqual({
      tabId: 'tab-new',
      handle: 'term_new'
    })
  })
})

describe('project links', () => {
  it('lets a linked peer be addressed as "Name @ Project", both ways', () => {
    const links = new AgentCanvasCrossLinks(tempDir())
    links.add(
      { projectKey: 'api', sessionId: 'lead' },
      { projectKey: 'web', sessionId: 'pixel' },
      'now'
    )
    const pixel = createSessionNode({ sessionId: 'pixel', label: 'Pixel', at: AT, id })
    const boards = {
      api: team(),
      web: { ...emptyAgentCanvasSnapshot(), document: addNode(createDocument(), pixel) }
    }
    const sources = {
      links,
      boardOf: (key: string) => (key === 'api' ? boards.api : boards.web),
      projectName: (key: string) => (key === 'api' ? 'Backend' : 'Frontend')
    }
    expect(linkedPeersOf({ projectKey: 'api', sessionId: 'lead' }, sources)).toMatchObject([
      { address: 'Pixel @ Frontend', sessionId: 'pixel' }
    ])
    expect(
      resolveTeamPeer(
        boards.api,
        { projectKey: 'api', sessionId: 'lead' },
        'pixel @ frontend',
        sources
      )
    ).toMatchObject({ sessionId: 'pixel', linked: { projectKey: 'web' } })
    expect(
      resolveTeamPeer(boards.api, { projectKey: 'api', sessionId: 'lead' }, 'Scout', sources)
    ).toMatchObject({ sessionId: 'scout', linked: null })
    // A bare name never reaches across: only the address does.
    expect(() =>
      resolveTeamPeer(boards.api, { projectKey: 'api', sessionId: 'lead' }, 'Pixel', sources)
    ).toThrow()
    links.renameSession({ projectKey: 'web', sessionId: 'pixel' }, 'pixel-2')
    expect(
      new AgentCanvasCrossLinks(dirs[0]!).peersOf({ projectKey: 'api', sessionId: 'lead' })
    ).toMatchObject([{ other: { sessionId: 'pixel-2' } }])
  })
})

describe('AgentCanvasRoleStore', () => {
  it('scopes roles to a project, shadows global ones, and persists', () => {
    const dir = tempDir()
    const roles = new AgentCanvasRoleStore(dir)
    roles.create('Reviewer', 'global prompt', 'api', 'global')
    roles.create('Reviewer', 'api prompt', 'api', 'current')
    expect(roles.find('reviewer', 'api').prompt).toBe('api prompt')
    expect(roles.find('Reviewer', 'web').prompt).toBe('global prompt')
    expect(() => roles.create('Reviewer', 'again', 'api', 'current')).toThrow(
      expect.objectContaining({ code: 'canvas_role_exists' })
    )
    roles.update('Reviewer', 'api', { oldText: 'api', newText: 'API' })
    expect(new AgentCanvasRoleStore(dir).find('Reviewer', 'api').prompt).toBe('API prompt')
    expect(roleBriefing(roles.find('Reviewer', 'api'), 'go')).toContain('<your_assigned_role')
  })
})
