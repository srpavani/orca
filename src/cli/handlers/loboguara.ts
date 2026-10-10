import { spawnProcess } from '../../shared/child-process/run-process'
import { resolveClaudeCommand } from '../../shared/node-cli-command-resolution'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import { stripElectronRunAsNode } from '../runtime/launch'

type LoboGuaraLaunch = { env: Record<string, string>; envToDelete: string[] }

/** Covers the browser sign-in, which waits up to two minutes for the user. */
const SIGN_IN_TIMEOUT_MS = 150_000

function claudeEnv(launch: LoboGuaraLaunch): Record<string, string> {
  // Why strip: the launcher runs Electron as Node; `claude` must not inherit that.
  const env = Object.fromEntries(
    Object.entries(stripElectronRunAsNode(process.env)).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  )
  for (const key of launch.envToDelete) {
    for (const name of Object.keys(env)) {
      if (process.platform === 'win32' ? name.toUpperCase() === key : name === key) {
        delete env[name]
      }
    }
  }
  return { ...env, ...launch.env }
}

function runClaude(env: Record<string, string>, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess({
      program: resolveClaudeCommand({ pathEnv: env.PATH ?? env.Path ?? null }),
      args,
      env,
      stdio: 'inherit',
      timeoutMs: null
    })
    // Why: Ctrl+C belongs to Claude Code; the wrapper must outlive it to report the exit.
    const ignore = (): void => {}
    process.on('SIGINT', ignore)
    child.once('error', (error) => {
      process.off('SIGINT', ignore)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      process.off('SIGINT', ignore)
      resolve(typeof code === 'number' ? code : signal ? 1 : 0)
    })
  })
}

export const LOBO_GUARA_HANDLERS: Record<string, CommandHandler> = {
  loboguara: async ({ client, rawArgs }) => {
    const args = rawArgs ?? []
    if (args[0] === 'logout') {
      await client.call('loboguara.signOut')
      process.stdout.write('Saiu do Lobo-Guará.\n')
      return
    }
    const status = await client.call<{ signedIn: boolean }>('loboguara.status')
    if (!status.result.signedIn) {
      process.stdout.write('🐺 Abrindo o navegador para entrar no Lobo-Guará…\n')
    }
    const response = await client.call<{ launch: LoboGuaraLaunch | null }>(
      'loboguara.prepareLaunch',
      { signIn: true },
      { timeoutMs: SIGN_IN_TIMEOUT_MS }
    )
    const launch = response.result.launch
    if (!launch) {
      throw new RuntimeClientError(
        'loboguara_not_signed_in',
        'Não foi possível entrar no Lobo-Guará. Rode `orca loboguara` de novo.'
      )
    }
    process.exitCode = await runClaude(claudeEnv(launch), args)
  }
}
