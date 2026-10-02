import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  landFloor,
  landingPreflight,
  landingPreview,
  landingTargets,
  parseMergeTree,
  parseWorktreeList,
  type GitRun
} from './floor-landing'

/** Real git, exit code kept: landing reads failures, it does not throw on them. */
const git: GitRun = (args, cwd) =>
  new Promise((resolve) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      const code = error && typeof error.code === 'number' ? error.code : error ? 1 : 0
      resolve({ exitCode: code, stdout, stderr })
    })
  })

async function must(args: string[], cwd: string): Promise<string> {
  const result = await git(args, cwd)
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  }
  return result.stdout.trim()
}

let base: string
let root: string
let floor: string

async function commitFile(cwd: string, file: string, body: string, message: string) {
  writeFileSync(join(cwd, file), body)
  await must(['add', file], cwd)
  await must(['commit', '-q', '-m', message], cwd)
}

beforeEach(async () => {
  base = mkdtempSync(join(tmpdir(), 'orca-landing-'))
  root = join(base, 'repo')
  floor = join(base, 'floor')
  await must(['init', '-q', '-b', 'main', root], base)
  await must(['config', 'user.email', 'test@example.com'], root)
  await must(['config', 'user.name', 'Test'], root)
  await must(['config', 'commit.gpgsign', 'false'], root)
  await commitFile(root, 'a.txt', 'one\n', 'init')
  await must(['branch', 'release'], root)
  await must(['worktree', 'add', '-q', '-b', 'floor/feature', floor], root)
  await commitFile(floor, 'b.txt', 'floor work\n', 'floor work')
}, 30_000)

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('parsers', () => {
  it('reads worktree porcelain, main checkout first', () => {
    const entries = parseWorktreeList(
      'worktree /r\nHEAD abc\nbranch refs/heads/main\n\nworktree /f\nHEAD def\ndetached\n'
    )
    expect(entries).toEqual([
      { path: '/r', branch: 'main' },
      { path: '/f', branch: null }
    ])
  })

  it('reads conflicts out of merge-tree output', () => {
    expect(parseMergeTree('tree1\na.txt\nb.txt\n\nCONFLICT (content)', 1)).toEqual({
      conflicts: ['a.txt', 'b.txt'],
      treeSHA: 'tree1'
    })
    expect(parseMergeTree('tree2\n', 0).conflicts).toEqual([])
  })

  it('marks a branch checked out in another worktree as unavailable', () => {
    const targets = landingTargets(
      ['main', 'other', 'floor/x'],
      'floor/x',
      [
        { path: '/r', branch: 'main' },
        { path: '/w', branch: 'other' }
      ],
      '/r'
    )
    expect(targets).toEqual([
      { name: 'main', isGroundBranch: true, unavailable: null },
      { name: 'other', isGroundBranch: false, unavailable: { worktreePath: '/w' } }
    ])
  })
})

describe('landing on a real repository', () => {
  it('lists the targets and previews what would land', async () => {
    const preflight = await landingPreflight(git, floor)
    expect(preflight.ok).toBe(true)
    if (!preflight.ok) {
      return
    }
    expect(preflight.floorBranch).toBe('floor/feature')
    expect(preflight.targets.map((target) => target.name).sort()).toEqual(['main', 'release'])
    const preview = await landingPreview(git, floor, 'main')
    expect(preview).toEqual({ files: ['b.txt'], commitCount: 1, conflicts: [] })
  }, 30_000)

  it('merges into the checked-out ground branch with a real merge', async () => {
    const result = await landFloor(git, floor, 'main')
    expect(result).toEqual({ status: 'merged', target: 'main', floorBranch: 'floor/feature' })
    expect(await must(['show', 'HEAD:b.txt'], root)).toBe('floor work')
    // Like the reference: no --no-ff, so an untouched ground branch fast-forwards.
    expect(await must(['rev-parse', 'main'], root)).toBe(await must(['rev-parse', 'HEAD'], floor))
  }, 30_000)

  it('merges into a branch nobody has checked out without touching a tree', async () => {
    const result = await landFloor(git, floor, 'release')
    expect(result.status).toBe('merged')
    expect(await must(['show', 'release:b.txt'], root)).toBe('floor work')
    expect(await must(['rev-parse', '--abbrev-ref', 'HEAD'], root)).toBe('main')
  }, 30_000)

  it('reports conflicts and leaves the target where it was', async () => {
    await commitFile(root, 'b.txt', 'ground work\n', 'ground work')
    const before = await must(['rev-parse', 'main'], root)
    const result = await landFloor(git, floor, 'main')
    expect(result).toEqual({ status: 'conflicts', files: ['b.txt'] })
    expect(await must(['rev-parse', 'main'], root)).toBe(before)
    expect(await must(['status', '--porcelain'], root)).toBe('')
  }, 30_000)

  it('refuses a dirty floor and a missing target', async () => {
    writeFileSync(join(floor, 'a.txt'), 'edited\n')
    expect(await landFloor(git, floor, 'main')).toEqual({
      status: 'refused',
      refusal: { reason: 'dirtyWorktree' }
    })
    expect(await landFloor(git, floor, 'nope')).toEqual({
      status: 'refused',
      refusal: { reason: 'targetMissing', branch: 'nope' }
    })
  }, 30_000)

  it('refuses to land Ground on itself', async () => {
    expect(await landingPreflight(git, root)).toEqual({
      ok: false,
      refusal: { reason: 'notIsolated' }
    })
  }, 30_000)

  it('refuses a target checked out in another worktree', async () => {
    const other = join(base, 'other')
    await must(['worktree', 'add', '-q', other, 'release'], root)
    const result = await landFloor(git, floor, 'release')
    expect(result.status).toBe('refused')
    expect(result.status === 'refused' ? result.refusal.reason : null).toBe(
      'targetCheckedOutElsewhere'
    )
  }, 30_000)
})
