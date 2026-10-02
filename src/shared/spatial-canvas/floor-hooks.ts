/**
 * Floor hooks, with the reference's shape.
 *
 * A workspace can define shell commands to run around a floor's life: `setup`
 * when the floor is provisioned, `run` when it is opened, `teardown` when it is
 * removed. The commands run inside the floor's own checkout, with the floor's
 * identity in the environment, so the same hook list serves every floor.
 *
 * The model, the section names, the per-command enable flag and the environment
 * variable names all come from the reference's `decodeWorkspaceHooks` and
 * `hookEnvironment`.
 */

export type FloorHookSection = 'setup' | 'run' | 'teardown'

export type FloorHookCommand = {
  id: string
  command: string
  /** A saved command can be kept but parked; absent means enabled. */
  isEnabled: boolean
}

export type WorkspaceHooks = {
  isEnabled: boolean
  /** Why setup is separable: installing dependencies is not something you want on every open. */
  autoRunSetup: boolean
  setupCommands: readonly FloorHookCommand[]
  runCommands: readonly FloorHookCommand[]
  teardownCommands: readonly FloorHookCommand[]
}

/** The variables the reference exports to every hook process, in its order. */
export const FLOOR_HOOK_ENVIRONMENT_VARIABLES = [
  'MAESTRI_FLOOR_NAME',
  'MAESTRI_BRANCH_NAME',
  'MAESTRI_FLOOR_PATH',
  'MAESTRI_ROOT_PATH',
  'MAESTRI_PROJECT_NAME'
] as const

export const FLOOR_HOOK_SECTIONS: readonly FloorHookSection[] = ['setup', 'run', 'teardown']

export function emptyWorkspaceHooks(): WorkspaceHooks {
  return {
    // Disabled by default: a hook runs shell commands, so it is opt-in.
    isEnabled: false,
    autoRunSetup: true,
    setupCommands: [],
    runCommands: [],
    teardownCommands: []
  }
}

/**
 * The hooks of a document. Typed structurally rather than against CanvasDocument
 * so this module does not have to import the document type back.
 */
export function documentHooks(document: { hooks?: WorkspaceHooks }): WorkspaceHooks {
  return document.hooks ?? emptyWorkspaceHooks()
}

export function hookCommandsInSection(
  hooks: WorkspaceHooks,
  section: FloorHookSection
): readonly FloorHookCommand[] {
  if (section === 'setup') {
    return hooks.setupCommands
  }
  if (section === 'run') {
    return hooks.runCommands
  }
  return hooks.teardownCommands
}

export function hasAnyHookCommands(hooks: WorkspaceHooks): boolean {
  return FLOOR_HOOK_SECTIONS.some((section) => hookCommandsInSection(hooks, section).length > 0)
}

/** The commands that would actually run: parked ones are skipped. */
export function enabledHookCommands(
  hooks: WorkspaceHooks,
  section: FloorHookSection
): readonly FloorHookCommand[] {
  return hookCommandsInSection(hooks, section).filter((entry) => entry.isEnabled)
}

/**
 * Whether a section should run at all. `isEnabled` is the master switch, and
 * `autoRunSetup` only governs setup, so a user can keep setup manual while run
 * and teardown stay automatic.
 */
export function shouldRunHookSection(hooks: WorkspaceHooks, section: FloorHookSection): boolean {
  if (!hooks.isEnabled) {
    return false
  }
  if (section === 'setup' && !hooks.autoRunSetup) {
    return false
  }
  return enabledHookCommands(hooks, section).length > 0
}

export type FloorHookContext = {
  floor: {
    name: string
    branchName: string | null
    /** The floor's own checkout; null when the floor shares the ground directory. */
    clonePath: string | null
    workingSubdirectory: string | null
  }
  workspace: { name: string; rootPath: string }
  /** The ambient environment; the reference passes the whole process env through. */
  base?: Readonly<Record<string, string | undefined>>
}

/**
 * The environment a hook process gets. `MAESTRI_FLOOR_PATH` is the floor's
 * checkout plus its subdirectory; when the floor has no checkout of its own it
 * falls back to the workspace root, which is the same rule the reference uses.
 */
export function buildHookEnvironment(context: FloorHookContext): Record<string, string> {
  const environment: Record<string, string> = {}
  for (const [key, value] of Object.entries(context.base ?? {})) {
    if (value !== undefined) {
      environment[key] = value
    }
  }
  const rootPath = context.workspace.rootPath
  const subdirectory = context.floor.workingSubdirectory
  const floorPath =
    context.floor.clonePath === null
      ? rootPath
      : subdirectory === null || subdirectory === ''
        ? context.floor.clonePath
        : `${context.floor.clonePath.replace(/[/\\]+$/, '')}/${subdirectory}`
  environment.TERM = 'xterm-256color'
  environment.COLORTERM = 'truecolor'
  environment.MAESTRI_FLOOR_NAME = context.floor.name
  environment.MAESTRI_BRANCH_NAME = context.floor.branchName ?? ''
  environment.MAESTRI_FLOOR_PATH = floorPath
  environment.MAESTRI_ROOT_PATH = rootPath
  environment.MAESTRI_PROJECT_NAME = context.workspace.name
  return environment
}

/**
 * One shell line for a section: the reference runs each command as its own
 * process, and a terminal can only be handed one line, so they are chained with
 * `&&` — the first failure stops the rest, and the terminal keeps the output.
 */
export function hookCommandLine(hooks: WorkspaceHooks, section: FloorHookSection): string | null {
  const commands = enabledHookCommands(hooks, section)
    .map((entry) => entry.command.trim())
    .filter((command) => command.length > 0)
  return commands.length === 0 ? null : commands.join(' && ')
}

/**
 * Parses the sheet's textarea: one command per line, blanks skipped. A line that
 * matches a command already on record keeps that record, so a command parked
 * elsewhere is not silently re-enabled by an unrelated edit.
 */
export function parseHookCommands(
  text: string,
  idFactory: () => string,
  previous: readonly FloorHookCommand[] = []
): FloorHookCommand[] {
  const known = new Map(previous.map((entry) => [entry.command.trim(), entry]))
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((command) => known.get(command) ?? { id: idFactory(), command, isEnabled: true })
}

/** Renders commands for the textarea. Every command is listed, parked ones included. */
export function formatHookCommands(commands: readonly FloorHookCommand[]): string {
  return commands.map((entry) => entry.command).join('\n')
}
