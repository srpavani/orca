import { describe, expect, it } from 'vitest'
import {
  buildHookEnvironment,
  emptyWorkspaceHooks,
  enabledHookCommands,
  formatHookCommands,
  hasAnyHookCommands,
  hookCommandLine,
  hookCommandsInSection,
  parseHookCommands,
  shouldRunHookSection,
  type WorkspaceHooks
} from './floor-hooks'

function ids(): () => string {
  let next = 0
  return () => `h${++next}`
}

const hooks = (overrides: Partial<WorkspaceHooks> = {}): WorkspaceHooks => ({
  ...emptyWorkspaceHooks(),
  isEnabled: true,
  ...overrides
})

const command = (
  text: string,
  isEnabled = true
): { id: string; command: string; isEnabled: boolean } => ({
  id: text,
  command: text,
  isEnabled
})

describe('hook model', () => {
  it('starts disabled so nothing runs shell commands unasked', () => {
    const empty = emptyWorkspaceHooks()
    expect(empty.isEnabled).toBe(false)
    expect(empty.autoRunSetup).toBe(true)
    expect(hasAnyHookCommands(empty)).toBe(false)
  })

  it('reports commands per section', () => {
    const withHooks = hooks({
      setupCommands: [command('pnpm install')],
      runCommands: [command('pnpm dev'), command('pnpm test', false)],
      teardownCommands: []
    })
    expect(hasAnyHookCommands(withHooks)).toBe(true)
    expect(hookCommandsInSection(withHooks, 'setup')).toHaveLength(1)
    expect(enabledHookCommands(withHooks, 'run').map((entry) => entry.command)).toEqual([
      'pnpm dev'
    ])
    expect(hookCommandsInSection(withHooks, 'teardown')).toEqual([])
  })
})

describe('shouldRunHookSection', () => {
  const withCommands = hooks({
    setupCommands: [command('pnpm install')],
    runCommands: [command('pnpm dev')],
    teardownCommands: [command('rm -rf .cache')]
  })

  it('runs nothing while the master switch is off', () => {
    const off = { ...withCommands, isEnabled: false }
    expect(shouldRunHookSection(off, 'setup')).toBe(false)
    expect(shouldRunHookSection(off, 'run')).toBe(false)
    expect(shouldRunHookSection(off, 'teardown')).toBe(false)
  })

  it('holds back only setup when auto-run setup is off', () => {
    const manual = { ...withCommands, autoRunSetup: false }
    expect(shouldRunHookSection(manual, 'setup')).toBe(false)
    expect(shouldRunHookSection(manual, 'run')).toBe(true)
    expect(shouldRunHookSection(manual, 'teardown')).toBe(true)
  })

  it('runs nothing for a section with no enabled command', () => {
    expect(shouldRunHookSection(hooks({ runCommands: [command('pnpm dev', false)] }), 'run')).toBe(
      false
    )
  })
})

describe('hookCommandLine', () => {
  it('chains the enabled commands and skips parked ones', () => {
    const value = hooks({
      runCommands: [command('pnpm install'), command('pnpm dev', false), command('pnpm test')]
    })
    expect(hookCommandLine(value, 'run')).toBe('pnpm install && pnpm test')
  })

  it('returns null when there is nothing to run', () => {
    expect(hookCommandLine(hooks(), 'setup')).toBeNull()
    expect(hookCommandLine(hooks({ setupCommands: [command('  ')] }), 'setup')).toBeNull()
  })
})

describe('buildHookEnvironment', () => {
  it('exports the reference variable names with the floor identity', () => {
    const environment = buildHookEnvironment({
      floor: {
        name: 'Refactor',
        branchName: 'refactor-auth',
        clonePath: '/data/floors/f1',
        workingSubdirectory: null
      },
      workspace: { name: 'Acme', rootPath: '/work/acme' },
      base: { PATH: '/usr/bin', DROPPED: undefined }
    })
    expect(environment).toMatchObject({
      PATH: '/usr/bin',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      MAESTRI_FLOOR_NAME: 'Refactor',
      MAESTRI_BRANCH_NAME: 'refactor-auth',
      MAESTRI_FLOOR_PATH: '/data/floors/f1',
      MAESTRI_ROOT_PATH: '/work/acme',
      MAESTRI_PROJECT_NAME: 'Acme'
    })
    expect('DROPPED' in environment).toBe(false)
  })

  it('falls back to the workspace root when the floor has no checkout', () => {
    const environment = buildHookEnvironment({
      floor: { name: 'Ground', branchName: null, clonePath: null, workingSubdirectory: null },
      workspace: { name: 'Acme', rootPath: '/work/acme' }
    })
    expect(environment.MAESTRI_FLOOR_PATH).toBe('/work/acme')
    expect(environment.MAESTRI_BRANCH_NAME).toBe('')
  })

  it('appends the floor subdirectory to its checkout', () => {
    const environment = buildHookEnvironment({
      floor: {
        name: 'Mono',
        branchName: 'mono',
        clonePath: '/data/floors/f2/',
        workingSubdirectory: 'packages/web'
      },
      workspace: { name: 'Acme', rootPath: '/work/acme' }
    })
    expect(environment.MAESTRI_FLOOR_PATH).toBe('/data/floors/f2/packages/web')
  })
})

describe('hook command text', () => {
  it('parses one command per line and skips blanks', () => {
    const parsed = parseHookCommands('  pnpm install \n\npnpm dev\n', ids())
    expect(parsed.map((entry) => entry.command)).toEqual(['pnpm install', 'pnpm dev'])
    expect(parsed.every((entry) => entry.isEnabled)).toBe(true)
  })

  it('keeps a parked command parked across an unrelated edit', () => {
    const previous = [command('pnpm dev', false)]
    const parsed = parseHookCommands('pnpm dev\npnpm test', ids(), previous)
    expect(parsed[0]).toBe(previous[0])
    expect(parsed[0].isEnabled).toBe(false)
    expect(parsed[1].isEnabled).toBe(true)
  })

  it('round-trips through the textarea without losing commands', () => {
    const original = [command('pnpm install'), command('pnpm dev', false)]
    const text = formatHookCommands(original)
    expect(text.split('\n')).toHaveLength(2)
    expect(parseHookCommands(text, ids(), original).map((entry) => entry.command)).toEqual([
      'pnpm install',
      'pnpm dev'
    ])
  })
})
