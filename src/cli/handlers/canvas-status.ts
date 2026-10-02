import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { getRequiredStringFlag } from '../flags'
import { callerParams } from './canvas'

type StatusRow = {
  sessionId: string
  label: string
  state: 'working' | 'quiet' | 'gone'
  quietForMs: number | null
  isLead: boolean
  watched: boolean
}
type WatchResult = {
  session: { sessionId: string; label: string }
  watched: boolean
  revision: number
}
type FloorCreateResult = {
  floor: { id: string; name: string; branch: string | null }
  revision: number
}

async function status(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<{ sessions: StatusRow[] }>('canvas.status', callerParams())
  printResult(response, ctx.json, formatStatus)
}

/** Human wording for how long a terminal has been silent. */
export function formatQuietFor(quietForMs: number | null): string {
  if (quietForMs === null) {
    return 'no output yet'
  }
  const seconds = Math.round(quietForMs / 1000)
  return seconds < 60 ? `silent ${seconds}s` : `silent ${Math.round(seconds / 60)}min`
}

export function formatStatus(result: { sessions: StatusRow[] }): string {
  if (result.sessions.length === 0) {
    return 'No sessions on the canvas.'
  }
  return result.sessions
    .map((row) => {
      const state =
        row.state === 'working'
          ? 'working now'
          : row.state === 'gone'
            ? 'terminal closed'
            : `idle — ${formatQuietFor(row.quietForMs)}`
      const flags = [row.isLead ? 'lead' : null, row.watched ? null : 'sonar off']
        .filter((flag): flag is string => flag !== null)
        .join(', ')
      return `${row.label}: ${state}${flags ? ` (${flags})` : ''}`
    })
    .join('\n')
}

async function watch(ctx: HandlerContext): Promise<void> {
  const to = ctx.flags.get('to')
  const response = await ctx.client.call<WatchResult>('canvas.watch', {
    ...callerParams(),
    ...(typeof to === 'string' && to.length > 0 ? { to } : {}),
    watched: ctx.flags.get('off') !== true
  })
  printResult(response, ctx.json, (result) =>
    result.watched
      ? `Watching "${result.session.label}" — the user is told when it goes quiet.`
      : `Sonar off for "${result.session.label}".`
  )
}

async function floorCreate(ctx: HandlerContext): Promise<void> {
  const branch = ctx.flags.get('branch')
  const response = await ctx.client.call<FloorCreateResult>('canvas.floorCreate', {
    ...callerParams(),
    name: getRequiredStringFlag(ctx.flags, 'name'),
    ...(typeof branch === 'string' && branch.length > 0 ? { branch } : {})
  })
  printResult(
    response,
    ctx.json,
    (result) =>
      `Floor "${result.floor.name}"${
        result.floor.branch ? ` pinned to ${result.floor.branch}` : ''
      } is ready.`
  )
}

/** Sonar and board-structure verbs, kept apart so the ask/note handlers stay readable. */
export const CANVAS_STATUS_HANDLERS: Record<string, CommandHandler> = {
  'canvas status': status,
  'canvas watch': watch,
  'canvas floor create': floorCreate
}
