import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { getRequiredStringFlag } from '../flags'
import { callerParams } from './canvas'

/**
 * Turns the escapes an agent can type in one shell argument into keys, as the
 * reference's `ask --raw` does. `\n` is Enter, which a TUI reads as CR.
 */
export function decodeRawInput(text: string): string {
  return text.replace(/\\(x[0-9a-fA-F]{2}|[ntre\\])/g, (_match, code: string) => {
    if (code.startsWith('x')) {
      return String.fromCharCode(Number.parseInt(code.slice(1), 16))
    }
    return RAW_ESCAPES.get(code) ?? code
  })
}

const RAW_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['n', '\r'],
  ['r', '\r'],
  ['t', '\t'],
  ['e', '\x1b'],
  ['\\', '\\']
])

export async function askRaw(ctx: HandlerContext, raw: string): Promise<void> {
  const response = await ctx.client.call<{ peer: { label: string }; bytesWritten: number }>(
    'canvas.input',
    { ...callerParams(), to: getRequiredStringFlag(ctx.flags, 'to'), text: decodeRawInput(raw) }
  )
  printResult(
    response,
    ctx.json,
    (result) => `Sent ${result.bytesWritten} byte(s) to ${result.peer.label}.`
  )
}

type ConnectResult = {
  from: { label: string }
  to: { label: string }
  created: boolean
  via: 'wire' | 'bridge'
}

async function connect(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<ConnectResult>('canvas.connect', {
    ...callerParams(),
    from: getRequiredStringFlag(ctx.flags, 'from'),
    to: getRequiredStringFlag(ctx.flags, 'to')
  })
  printResult(response, ctx.json, (result) =>
    result.created
      ? `Connected "${result.from.label}" and "${result.to.label}" with a ${result.via}.`
      : `"${result.from.label}" and "${result.to.label}" were already connected.`
  )
}

type NoteResult = { note: { noteId: string; displayName: string }; revision: number }

// Why: shells pass "\n" literally; agents write multi-line text as one argument.
const unescapeLines = (text: string): string => text.replace(/\\n/g, '\n')

async function noteCreate(ctx: HandlerContext): Promise<void> {
  const text = ctx.flags.get('text')
  const name = ctx.flags.get('name')
  const response = await ctx.client.call<NoteResult>('canvas.noteCreate', {
    ...callerParams(),
    body: typeof text === 'string' ? unescapeLines(text) : '',
    ...(typeof name === 'string' && name.length > 0 ? { name } : {})
  })
  printResult(response, ctx.json, (result) => `Created note "${result.note.displayName}".`)
}

async function noteEdit(ctx: HandlerContext): Promise<void> {
  const response = await ctx.client.call<NoteResult>('canvas.noteEdit', {
    ...callerParams(),
    note: getRequiredStringFlag(ctx.flags, 'note'),
    oldText: unescapeLines(getRequiredStringFlag(ctx.flags, 'old')),
    newText: unescapeLines(getRequiredStringFlag(ctx.flags, 'new'))
  })
  printResult(response, ctx.json, (result) => `Edited note "${result.note.displayName}".`)
}

export const CANVAS_TEAM_HANDLERS: Record<string, CommandHandler> = {
  'canvas connect': connect,
  'canvas note create': noteCreate,
  'canvas note edit': noteEdit
}
