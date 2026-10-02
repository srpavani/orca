import { describe, expect, it } from 'vitest'
import {
  decideFloorIsolation,
  isExcluded,
  isValidBranchName,
  planSeed,
  slugifyBranch,
  type FloorIsolationFacts
} from './floor-isolation'

const facts = (overrides: Partial<FloorIsolationFacts> = {}): FloorIsolationFacts => ({
  gitUsable: true,
  groundDirectory: '/work/project',
  isRepository: true,
  hasCommits: true,
  branch: 'refactor-auth',
  existingBranch: false,
  branchExists: false,
  checkedOut: null,
  managedPathAvailable: true,
  managedPath: '/data/floors/f1',
  ...overrides
})

describe('slugifyBranch', () => {
  it('turns a floor name into a branch-safe slug', () => {
    expect(slugifyBranch('Refactor Auth')).toBe('refactor-auth')
    expect(slugifyBranch('  Fix: the ~thing~  ')).toBe('fix-the-thing')
    expect(slugifyBranch('a//b')).toBe('a/b')
    expect(slugifyBranch('—')).toBe('')
  })

  it('caps the length and never ends on a separator', () => {
    const slug = slugifyBranch('x'.repeat(80))
    expect(slug).toHaveLength(60)
    expect(slugifyBranch(`${'y'.repeat(59)}-`)).toBe('y'.repeat(59))
  })
})

describe('isValidBranchName', () => {
  it.each(['main', 'feature/x', 'a.b-c_d', 'release/2026.01'])('accepts %s', (branch) => {
    expect(isValidBranchName(branch)).toBe(true)
  })

  it.each([
    '',
    'has space',
    'tilde~name',
    'caret^name',
    'colon:name',
    'star*name',
    'question?name',
    'bracket[name',
    'back\\slash',
    'double..dot',
    'at@{brace',
    'double//slash',
    '-leading',
    '/leading',
    'trailing/',
    'trailing.',
    'locking.lock',
    '.hidden',
    'a/.hidden'
  ])('rejects %j', (branch) => {
    expect(isValidBranchName(branch)).toBe(false)
  })
})

describe('isExcluded', () => {
  const excluded = new Set(['node_modules', 'dist'])

  it('excludes everything under a named folder, and only that folder', () => {
    expect(isExcluded('node_modules/react/index.js', excluded)).toBe(true)
    expect(isExcluded('src/dist/output.js', excluded)).toBe(true)
    expect(isExcluded('src/app.ts', excluded)).toBe(false)
  })

  it('does not exclude a file that merely shares the name', () => {
    // Why: the reference walks the parents, so a *file* called node_modules is kept.
    expect(isExcluded('node_modules', excluded)).toBe(false)
    expect(isExcluded('src/node_modules.js', excluded)).toBe(false)
  })
})

describe('planSeed', () => {
  it('separates what is copied from what the exclusions leave behind', () => {
    const plan = planSeed(
      [
        { relativePath: 'src/app.ts', bytes: 100 },
        { relativePath: 'node_modules/react/index.js', bytes: 900 },
        { relativePath: 'README.md', bytes: 10 }
      ],
      new Set(['node_modules'])
    )
    expect(plan.entries.map((entry) => entry.relativePath)).toEqual(['src/app.ts', 'README.md'])
    expect(plan.totalBytes).toBe(110)
    expect(plan.excludedBytes).toBe(900)
    expect(plan.excludedFiles).toBe(1)
  })
})

describe('decideFloorIsolation', () => {
  it('allows an isolated floor when everything checks out', () => {
    expect(decideFloorIsolation(facts())).toBeNull()
  })

  it('refuses in the reference order, cheapest check first', () => {
    expect(decideFloorIsolation(facts({ gitUsable: false, groundDirectory: null }))).toEqual({
      reason: 'gitUnusable'
    })
    expect(decideFloorIsolation(facts({ groundDirectory: null }))).toEqual({
      reason: 'noWorkingDirectory'
    })
    expect(decideFloorIsolation(facts({ isRepository: false }))).toEqual({
      reason: 'notARepository',
      directory: '/work/project'
    })
    expect(decideFloorIsolation(facts({ hasCommits: false }))).toEqual({
      reason: 'repositoryHasNoCommits',
      directory: '/work/project'
    })
    // An invalid name is refused before any repository lookup is consulted.
    expect(
      decideFloorIsolation(facts({ branch: 'not valid', checkedOut: { at: 'here' } }))
    ).toEqual({ reason: 'invalidBranchName', branch: 'not valid' })
  })

  it('refuses a branch another floor here already has, naming the path', () => {
    expect(decideFloorIsolation(facts({ checkedOut: { at: 'here' } }))).toEqual({
      reason: 'branchCheckedOutHere',
      branch: 'refactor-auth'
    })
    expect(
      decideFloorIsolation(facts({ checkedOut: { at: 'elsewhere', path: '/other/checkout' } }))
    ).toEqual({
      reason: 'branchCheckedOutElsewhere',
      branch: 'refactor-auth',
      path: '/other/checkout'
    })
  })

  it('refuses a missing existing branch, and a new branch that already exists', () => {
    expect(decideFloorIsolation(facts({ existingBranch: true, branchExists: false }))).toEqual({
      reason: 'branchMissing',
      branch: 'refactor-auth'
    })
    expect(decideFloorIsolation(facts({ existingBranch: false, branchExists: true }))).toEqual({
      reason: 'branchCheckedOutElsewhere',
      branch: 'refactor-auth',
      path: ''
    })
  })

  it('refuses an unusable path last', () => {
    expect(decideFloorIsolation(facts({ managedPathAvailable: false }))).toEqual({
      reason: 'managedPathUnavailable',
      path: '/data/floors/f1'
    })
  })
})
