/**
 * Floor isolation, with the reference's decisions.
 *
 * A floor can be "isolated": its own checkout of the project on its own branch,
 * so an agent working there cannot touch the ground floor's files. The rules that
 * decide whether that is possible — and the exact reasons it is refused — were
 * read out of Maestri's `provisionFloor` and its refusal vocabulary, and live
 * here as pure functions so they can be tested without a repository.
 *
 * Orca does the git work itself (a managed worktree); this module owns the
 * verdict, not the checkout.
 */

export type FloorRefusalReason =
  | 'gitUnusable'
  | 'noWorkingDirectory'
  | 'notARepository'
  | 'repositoryHasNoCommits'
  | 'invalidBranchName'
  | 'branchCheckedOutHere'
  | 'branchCheckedOutElsewhere'
  | 'branchMissing'
  | 'managedPathUnavailable'

export type FloorRefusal = {
  reason: FloorRefusalReason
  /** Interpolated into the message: the branch the user asked for. */
  branch?: string
  /** Interpolated into the message: the offending directory. */
  directory?: string
  /** Interpolated into the message: the worktree path already using the branch. */
  path?: string
}

/** How often the seed copy may report progress; the reference throttles at 250 ms. */
export const SEED_PROGRESS_THROTTLE_MS = 250

const BRANCH_SLUG_MAX = 60

/**
 * Branch name derived from a floor name, for when the user did not type one.
 * Lower-cased, spaces and runs of unusable characters become single dashes.
 */
export function slugifyBranch(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\s~^:?*[\\]+/g, '-')
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/-{2,}/g, '-')
    // Why collapse slashes too: git rejects `//`, so a slug that kept one would
    // be refused by isValidBranchName straight after being produced here.
    .replace(/\/{2,}/g, '/')
    .replace(/^[-./]+/, '')
    .replace(/[-./]+$/, '')
  return slug.slice(0, BRANCH_SLUG_MAX).replace(/[-./]+$/, '')
}

/** Control characters are checked by code point: a regex for them trips the linter. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

/**
 * Git's own rules for a branch name. Checked before touching the repository so
 * the user gets "that is not a valid name" instead of a raw git failure.
 */
export function isValidBranchName(branch: string): boolean {
  if (branch.length === 0 || branch.length > 255) {
    return false
  }
  if (hasControlCharacter(branch) || /[\s~^:?*[\\]/.test(branch)) {
    return false
  }
  if (branch.includes('..') || branch.includes('@{') || branch.includes('//')) {
    return false
  }
  if (branch.startsWith('-') || branch.startsWith('/') || branch.endsWith('/')) {
    return false
  }
  if (branch.endsWith('.') || branch.endsWith('.lock')) {
    return false
  }
  if (branch.split('/').some((part) => part.length === 0 || part.startsWith('.'))) {
    return false
  }
  return true
}

/**
 * A path is excluded when any of its *parent* directories is excluded — the
 * reference walks the segments and never excludes the file itself, so a folder
 * named in the list takes everything under it and nothing else.
 */
export function isExcluded(
  relativePath: string,
  excludedDirectories: ReadonlySet<string>
): boolean {
  const segments = relativePath.split('/')
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    if (segment !== undefined && excludedDirectories.has(segment)) {
      return true
    }
  }
  return false
}

export type SeedEntry = { relativePath: string; bytes: number }

export type SeedPlan = {
  entries: readonly SeedEntry[]
  totalBytes: number
  /** Bytes left behind by the exclusions, so the sheet can say what it is skipping. */
  excludedBytes: number
  excludedFiles: number
}

/** What a floor's clone would copy from the ground floor, and what it would skip. */
export function planSeed(
  entries: readonly SeedEntry[],
  excludedDirectories: ReadonlySet<string>
): SeedPlan {
  const kept: SeedEntry[] = []
  let totalBytes = 0
  let excludedBytes = 0
  let excludedFiles = 0
  for (const entry of entries) {
    if (isExcluded(entry.relativePath, excludedDirectories)) {
      excludedBytes += entry.bytes
      excludedFiles += 1
      continue
    }
    kept.push(entry)
    totalBytes += entry.bytes
  }
  return { entries: kept, totalBytes, excludedBytes, excludedFiles }
}

/** Where the branch the user asked for is already checked out, if anywhere. */
export type BranchCheckout = { at: 'here' } | { at: 'elsewhere'; path: string } | null

export type FloorIsolationFacts = {
  /** False when git cannot be run on this machine at all. */
  gitUsable: boolean
  /** The workspace's working directory; null when the workspace has none. */
  groundDirectory: string | null
  /** Whether that directory is inside a git repository. */
  isRepository: boolean
  /** Whether the repository has at least one commit to branch from. */
  hasCommits: boolean
  branch: string
  /** True when the user pointed at a branch that already exists. */
  existingBranch: boolean
  branchExists: boolean
  /** Where that branch is checked out, when it is. */
  checkedOut: BranchCheckout
  /** Whether the floor's own directory can be used. */
  managedPathAvailable: boolean
  managedPath: string
}

/**
 * The reference's checks, in its order, returning the first refusal. Checks run
 * cheapest-first: the ones that need no repository access come before the ones
 * that do, so an invalid name never reaches git.
 */
export function decideFloorIsolation(facts: FloorIsolationFacts): FloorRefusal | null {
  if (!facts.gitUsable) {
    return { reason: 'gitUnusable' }
  }
  if (facts.groundDirectory === null) {
    return { reason: 'noWorkingDirectory' }
  }
  if (!facts.isRepository) {
    return { reason: 'notARepository', directory: facts.groundDirectory }
  }
  if (!facts.hasCommits) {
    return { reason: 'repositoryHasNoCommits', directory: facts.groundDirectory }
  }
  if (!isValidBranchName(facts.branch)) {
    return { reason: 'invalidBranchName', branch: facts.branch }
  }
  if (facts.checkedOut?.at === 'here') {
    return { reason: 'branchCheckedOutHere', branch: facts.branch }
  }
  if (facts.checkedOut?.at === 'elsewhere') {
    return {
      reason: 'branchCheckedOutElsewhere',
      branch: facts.branch,
      path: facts.checkedOut.path
    }
  }
  if (facts.existingBranch && !facts.branchExists) {
    return { reason: 'branchMissing', branch: facts.branch }
  }
  // Why a new branch that exists is refused: the user asked to create one, and
  // silently reusing another branch is how two floors end up on the same files.
  if (!facts.existingBranch && facts.branchExists) {
    return { reason: 'branchCheckedOutElsewhere', branch: facts.branch, path: '' }
  }
  if (!facts.managedPathAvailable) {
    return { reason: 'managedPathUnavailable', path: facts.managedPath }
  }
  return null
}
