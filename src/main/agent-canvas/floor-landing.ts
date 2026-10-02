/**
 * Landing a floor: merging the branch a floor works on back into another branch
 * of the same repository, the way the reference does it.
 *
 * Two paths, chosen by where the target is checked out:
 * - the target is the main checkout's branch → a real `git merge` there, so the
 *   user's working tree moves with it (aborted again on conflict);
 * - the target is not checked out anywhere → plumbing (`merge-tree`,
 *   `commit-tree`, `update-ref`), which writes the merge commit without
 *   touching any working tree.
 * A target checked out in some other worktree is refused: moving its ref under
 * that worktree would leave it silently out of date.
 */

export type GitResult = { exitCode: number; stdout: string; stderr: string }
export type GitRun = (args: string[], cwd: string) => Promise<GitResult>

export type LandingRefusal =
  | { reason: 'notIsolated' }
  | { reason: 'notARepository'; directory: string }
  | { reason: 'worktreeMissing'; path: string }
  | { reason: 'detachedHead' }
  | { reason: 'targetMissing'; branch: string }
  | { reason: 'dirtyWorktree' }
  | { reason: 'targetCheckedOutElsewhere'; branch: string; worktreePath: string }
  | { reason: 'groundDirty'; detail: string }

export type LandingContext = {
  root: string
  groundBranch: string | null
  worktreePath: string
  floorBranch: string
}

export type LandingTarget = {
  name: string
  isGroundBranch: boolean
  unavailable: { worktreePath: string } | null
}

export type LandingResult =
  | { status: 'merged'; target: string; floorBranch: string }
  | { status: 'refused'; refusal: LandingRefusal }
  | { status: 'conflicts'; files: string[] }
  | { status: 'failed'; detail: string }

type WorktreeEntry = { path: string; branch: string | null }

const UNTRACKED_SAMPLE = 5

export function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => {
    const slashed = value.replace(/\\/g, '/').replace(/\/+$/, '')
    return /^[a-z]:\//i.test(slashed) ? slashed.toLowerCase() : slashed
  }
  return normalize(left) === normalize(right)
}

/** `git worktree list --porcelain` → entries; the first is the main checkout. */
export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let current: WorktreeEntry | null = null
  for (const line of porcelain.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null }
      entries.push(current)
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    }
  }
  return entries
}

/**
 * `merge-tree --write-tree --name-only`: line one is the tree, and on a
 * conflict (exit 1) the conflicted paths follow until the first blank line.
 */
export function parseMergeTree(
  stdout: string,
  exitCode: number
): { conflicts: string[]; treeSHA: string | null } {
  const lines = stdout.split(/\r?\n/)
  const treeSHA = (lines[0] ?? '').trim() || null
  if (exitCode === 0) {
    return { conflicts: [], treeSHA }
  }
  const conflicts: string[] = []
  for (const line of lines.slice(1)) {
    if (line.trim() === '') {
      break
    }
    conflicts.push(line)
  }
  return { conflicts, treeSHA }
}

/** Never hand git something it would read as an option. */
export function refArgumentSafe(ref: string): boolean {
  return ref !== '' && !ref.startsWith('-')
}

function failureDetail(result: GitResult): string {
  return (result.stderr.trim() || result.stdout.trim() || 'git failed').split('\n')[0] ?? ''
}

async function listWorktrees(git: GitRun, cwd: string): Promise<WorktreeEntry[]> {
  const result = await git(['worktree', 'list', '--porcelain'], cwd)
  return result.exitCode === 0 ? parseWorktreeList(result.stdout) : []
}

export async function resolveLanding(
  git: GitRun,
  worktreePath: string
): Promise<{ ok: true; context: LandingContext } | { ok: false; refusal: LandingRefusal }> {
  const worktrees = await listWorktrees(git, worktreePath)
  const main = worktrees[0]
  if (!main) {
    return { ok: false, refusal: { reason: 'notARepository', directory: worktreePath } }
  }
  const floor = worktrees.find((entry) => samePath(entry.path, worktreePath))
  if (!floor) {
    return { ok: false, refusal: { reason: 'worktreeMissing', path: worktreePath } }
  }
  // Why: a floor whose checkout is Ground itself has no separate branch of work;
  // the reference refuses it the same way it refuses a floor with no isolation.
  if (samePath(floor.path, main.path)) {
    return { ok: false, refusal: { reason: 'notIsolated' } }
  }
  if (floor.branch === null) {
    return { ok: false, refusal: { reason: 'detachedHead' } }
  }
  return {
    ok: true,
    context: {
      root: main.path,
      groundBranch: main.branch,
      worktreePath: floor.path,
      floorBranch: floor.branch
    }
  }
}

async function refExists(git: GitRun, cwd: string, branch: string): Promise<boolean> {
  if (!refArgumentSafe(branch)) {
    return false
  }
  const result = await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], cwd)
  return result.exitCode === 0
}

async function hasTrackedChanges(git: GitRun, cwd: string): Promise<boolean> {
  const [unstaged, staged] = await Promise.all([
    git(['diff', '--quiet'], cwd),
    git(['diff', '--cached', '--quiet'], cwd)
  ])
  return unstaged.exitCode !== 0 || staged.exitCode !== 0
}

/** Every local branch but the floor's own, marked where it cannot be landed on. */
export function landingTargets(
  branches: readonly string[],
  floorBranch: string,
  worktrees: readonly WorktreeEntry[],
  root: string
): LandingTarget[] {
  const checkedOut = new Map<string, string>()
  for (const entry of worktrees) {
    if (entry.branch !== null) {
      checkedOut.set(entry.branch, entry.path)
    }
  }
  return branches
    .filter((name) => name !== floorBranch)
    .map((name) => {
      const at = checkedOut.get(name)
      const isGroundBranch = at !== undefined && samePath(at, root)
      return {
        name,
        isGroundBranch,
        unavailable: at !== undefined && !isGroundBranch ? { worktreePath: at } : null
      }
    })
}

export async function landingPreflight(git: GitRun, worktreePath: string) {
  const resolved = await resolveLanding(git, worktreePath)
  if (!resolved.ok) {
    return { ok: false as const, refusal: resolved.refusal }
  }
  const { root, groundBranch, floorBranch } = resolved.context
  const [trackedDirty, untracked, branches, worktrees] = await Promise.all([
    hasTrackedChanges(git, resolved.context.worktreePath),
    git(['ls-files', '--others', '--exclude-standard', '-z'], resolved.context.worktreePath),
    git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], root),
    listWorktrees(git, root)
  ])
  const untrackedFiles =
    untracked.exitCode === 0 ? untracked.stdout.split('\0').filter((file) => file !== '') : []
  const local = branches.stdout.split(/\r?\n/).filter((name) => name.trim() !== '')
  return {
    ok: true as const,
    floorBranch,
    groundBranch,
    targets: landingTargets(local, floorBranch, worktrees, root),
    trackedDirty,
    untrackedCount: untrackedFiles.length,
    untrackedSample: untrackedFiles.slice(0, UNTRACKED_SAMPLE)
  }
}

/** What landing on `target` would bring: changed files, commits, conflicts. */
export async function landingPreview(git: GitRun, worktreePath: string, target: string) {
  const empty = { files: [] as string[], commitCount: 0, conflicts: [] as string[] }
  const resolved = await resolveLanding(git, worktreePath)
  if (!resolved.ok || !(await refExists(git, resolved.context.root, target))) {
    return empty
  }
  const { root, floorBranch } = resolved.context
  const [diff, count, tree] = await Promise.all([
    git(['diff', '--name-only', `${target}...${floorBranch}`], root),
    git(['rev-list', '--count', `${target}..${floorBranch}`], root),
    git(['merge-tree', '--write-tree', '--name-only', target, floorBranch], root)
  ])
  const commits = Number.parseInt(count.stdout.trim(), 10)
  return {
    files: diff.stdout.split(/\r?\n/).filter((file) => file.trim() !== ''),
    commitCount: Number.isFinite(commits) ? commits : 0,
    conflicts: parseMergeTree(tree.stdout, tree.exitCode).conflicts
  }
}

export async function landFloor(
  git: GitRun,
  worktreePath: string,
  target: string
): Promise<LandingResult> {
  const resolved = await resolveLanding(git, worktreePath)
  if (!resolved.ok) {
    return { status: 'refused', refusal: resolved.refusal }
  }
  const context = resolved.context
  if (!(await refExists(git, context.root, target))) {
    return { status: 'refused', refusal: { reason: 'targetMissing', branch: target } }
  }
  if (await hasTrackedChanges(git, context.worktreePath)) {
    return { status: 'refused', refusal: { reason: 'dirtyWorktree' } }
  }
  const elsewhere = (await listWorktrees(git, context.root)).find(
    (entry) => entry.branch === target && !samePath(entry.path, context.root)
  )
  if (elsewhere) {
    return {
      status: 'refused',
      refusal: { reason: 'targetCheckedOutElsewhere', branch: target, worktreePath: elsewhere.path }
    }
  }
  const outcome =
    context.groundBranch === target
      ? await mergeIntoCheckedOutTarget(git, context, target)
      : await mergeWithPlumbing(git, context, target)
  return outcome ?? { status: 'merged', target, floorBranch: context.floorBranch }
}

async function mergeIntoCheckedOutTarget(
  git: GitRun,
  context: LandingContext,
  target: string
): Promise<LandingResult | null> {
  const message = `Merge ${context.floorBranch} into ${target}`
  const merged = await git(['merge', '--no-edit', '-m', message, context.floorBranch], context.root)
  if (merged.exitCode === 0) {
    return null
  }
  const unmerged = await git(['diff', '--name-only', '--diff-filter=U', '-z'], context.root)
  const files = unmerged.stdout.split('\0').filter((file) => file !== '')
  if (files.length > 0) {
    await git(['merge', '--abort'], context.root)
    return { status: 'conflicts', files }
  }
  if (/local changes|would be overwritten/i.test(`${merged.stderr}\n${merged.stdout}`)) {
    return { status: 'refused', refusal: { reason: 'groundDirty', detail: failureDetail(merged) } }
  }
  return { status: 'failed', detail: failureDetail(merged) }
}

async function mergeWithPlumbing(
  git: GitRun,
  context: LandingContext,
  target: string
): Promise<LandingResult | null> {
  const { root, floorBranch } = context
  const tree = await git(['merge-tree', '--write-tree', '--name-only', target, floorBranch], root)
  if (tree.exitCode !== 0) {
    const { conflicts } = parseMergeTree(tree.stdout, tree.exitCode)
    return conflicts.length > 0
      ? { status: 'conflicts', files: conflicts }
      : { status: 'failed', detail: failureDetail(tree) }
  }
  const treeSHA = (tree.stdout.split(/\r?\n/)[0] ?? '').trim()
  if (treeSHA === '') {
    return { status: 'failed', detail: 'merge-tree returned no tree' }
  }
  const [base, head] = await Promise.all([
    git(['rev-parse', `refs/heads/${target}`], root),
    git(['rev-parse', `refs/heads/${floorBranch}`], root)
  ])
  if (base.exitCode !== 0 || head.exitCode !== 0) {
    return { status: 'failed', detail: 'could not resolve the branches to merge' }
  }
  const parent = base.stdout.trim()
  const commit = await git(
    [
      'commit-tree',
      treeSHA,
      '-p',
      parent,
      '-p',
      head.stdout.trim(),
      '-m',
      `Merge ${floorBranch} into ${target}`
    ],
    root
  )
  if (commit.exitCode !== 0) {
    return { status: 'failed', detail: failureDetail(commit) }
  }
  // Why the old value is passed: update-ref refuses if the target moved since
  // it was read, instead of overwriting someone else's commit.
  const moved = await git(
    ['update-ref', `refs/heads/${target}`, commit.stdout.trim(), parent],
    root
  )
  return moved.exitCode === 0 ? null : { status: 'failed', detail: failureDetail(moved) }
}
