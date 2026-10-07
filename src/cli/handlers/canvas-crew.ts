import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { getRequiredStringFlag } from '../flags'
import { callerParams } from './canvas'

type RecruitResult = {
  session: { sessionId: string; label: string; handle: string }
  floor: string | null
  bridged: boolean
  replaced?: string
  project?: string
  revision: number
}
type RoleView = { name: string; prompt: string; scope: 'current' | 'global'; current: boolean }

function optional(flag: string, ctx: HandlerContext): Record<string, string> {
  const value = ctx.flags.get(flag)
  return typeof value === 'string' && value.length > 0 ? { [flag]: value } : {}
}

// Why: shells pass "\n" literally; agents write multi-line prompts as one argument.
const unescapeLines = (text: string): string => text.replace(/\\n/g, '\n')

async function recruit(ctx: HandlerContext): Promise<void> {
  const replacing = typeof ctx.flags.get('replace') === 'string'
  const name = replacing
    ? optional('name', ctx)
    : { name: getRequiredStringFlag(ctx.flags, 'name') }
  const response = await ctx.client.call<RecruitResult>(
    'canvas.recruit',
    {
      ...callerParams(),
      ...name,
      ...optional('agent', ctx),
      ...optional('command', ctx),
      ...optional('prompt', ctx),
      ...optional('cwd', ctx),
      ...optional('floor', ctx),
      ...optional('role', ctx),
      ...optional('project', ctx),
      ...optional('replace', ctx)
    },
    // Spawning a terminal is slower than a read; leave room for the PTY to come up.
    { timeoutMs: 60_000 }
  )
  printResult(response, ctx.json, formatRecruit)
}

export function formatRecruit(result: RecruitResult): string {
  if (result.replaced !== undefined) {
    return `Replaced "${result.replaced}" in place with "${result.session.label}"; its wires and notes are kept. Brief it with ask: it starts with no history.`
  }
  if (result.project !== undefined) {
    return `Recruited "${result.session.label}" in ${result.project}, linked to you. Address it as "${result.session.label}".`
  }
  const where = result.floor === null ? 'the ground floor' : 'its own floor'
  const link = result.bridged ? 'bridged to you' : 'wired to you'
  return `Recruited "${result.session.label}" (${result.session.sessionId}) on ${where}, ${link}.`
}

async function dismiss(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<{ dismissed: string }>('canvas.dismiss', {
    ...callerParams(),
    to: getRequiredStringFlag(ctx.flags, 'to')
  })
  printResult(response, ctx.json, (result) => `Dismissed "${result.dismissed}".`)
}

async function presetList(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<{
    presets: { id: string; label: string; isYours: boolean }[]
  }>('canvas.presetList', callerParams())
  printResult(response, ctx.json, (result) =>
    result.presets
      .map(
        (preset) =>
          `  - ${preset.id}${preset.label === preset.id ? '' : ` (${preset.label})`}${preset.isYours ? ' ← you' : ''}`
      )
      .join('\n')
  )
}

export function formatRoles(roles: RoleView[]): string {
  const block = (title: string, rows: RoleView[]): string[] => [
    title,
    ...(rows.length === 0
      ? ['  (none)']
      : rows.map((role) => `  - ${role.name}: ${role.prompt.split('\n')[0]?.slice(0, 80) ?? ''}`))
  ]
  return [
    ...block(
      'Current project:',
      roles.filter((role) => role.scope === 'current')
    ),
    '',
    ...block(
      'Global:',
      roles.filter((role) => role.scope === 'global')
    )
  ].join('\n')
}

async function roleList(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<{ roles: RoleView[] }>('canvas.roleList', callerParams())
  printResult(response, ctx.json, (result) => formatRoles(result.roles))
}

async function roleShow(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<{ role: RoleView }>('canvas.roleShow', {
    ...callerParams(),
    name: getRequiredStringFlag(ctx.flags, 'name')
  })
  printResult(
    response,
    ctx.json,
    (result) => `── ${result.role.name} (${result.role.scope}) ──\n${result.role.prompt}`
  )
}

async function roleCreate(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<{ role: RoleView }>('canvas.roleCreate', {
    ...callerParams(),
    name: getRequiredStringFlag(ctx.flags, 'name'),
    prompt: unescapeLines(getRequiredStringFlag(ctx.flags, 'prompt')),
    ...optional('scope', ctx)
  })
  printResult(
    response,
    ctx.json,
    (result) => `Created role "${result.role.name}" (${result.role.scope}).`
  )
}

async function roleEdit(ctx: HandlerContext): Promise<void> {
  const oldText = ctx.flags.get('old')
  const newText = ctx.flags.get('new')
  const response = await ctx.client.call<{ role: RoleView }>('canvas.roleEdit', {
    ...callerParams(),
    name: getRequiredStringFlag(ctx.flags, 'name'),
    ...(typeof oldText === 'string' ? { oldText: unescapeLines(oldText) } : {}),
    ...(typeof newText === 'string' ? { newText: unescapeLines(newText) } : {}),
    ...optional('scope', ctx)
  })
  printResult(
    response,
    ctx.json,
    (result) => `Updated role "${result.role.name}" (${result.role.scope}).`
  )
}

async function roleWrite(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<{ role: RoleView }>('canvas.roleEdit', {
    ...callerParams(),
    name: getRequiredStringFlag(ctx.flags, 'name'),
    prompt: unescapeLines(getRequiredStringFlag(ctx.flags, 'prompt'))
  })
  printResult(response, ctx.json, (result) => `Rewrote role "${result.role.name}".`)
}

async function roleDelete(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<{ deleted: string }>('canvas.roleDelete', {
    ...callerParams(),
    name: getRequiredStringFlag(ctx.flags, 'name')
  })
  printResult(response, ctx.json, (result) => `Deleted role "${result.deleted}".`)
}

async function roleAssign(ctx: HandlerContext): Promise<void> {
  const clearing = ctx.flags.get('none') === true
  const response = await ctx.client.call<{ session: string; role: string | null }>(
    'canvas.roleAssign',
    {
      ...callerParams(),
      to: getRequiredStringFlag(ctx.flags, 'to'),
      ...(clearing ? {} : { role: getRequiredStringFlag(ctx.flags, 'role') })
    },
    { timeoutMs: 60_000 }
  )
  printResult(response, ctx.json, (result) =>
    result.role === null
      ? `Cleared the role on "${result.session}"; it restarted without one.`
      : `"${result.session}" restarted as "${result.role}". Brief it with ask: it starts with no history.`
  )
}

export const CANVAS_CREW_HANDLERS: Record<string, CommandHandler> = {
  'canvas recruit': recruit,
  'canvas dismiss': dismiss,
  'canvas preset list': presetList,
  'canvas role list': roleList,
  'canvas role show': roleShow,
  'canvas role create': roleCreate,
  'canvas role edit': roleEdit,
  'canvas role write': roleWrite,
  'canvas role delete': roleDelete,
  'canvas role assign': roleAssign
}
