import { randomBytes } from 'node:crypto'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { shell } from 'electron'
import { saveLoboGuaraToken } from './loboguara-token-store'

export const LOBO_GUARA_API_URL = 'https://api.loboguara.net/api'
const LOBO_GUARA_WEB_URL = 'https://app.loboguara.net'
const SIGN_IN_TIMEOUT_MS = 120_000

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${title} · Lobo-Guará</title>` +
  `<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0a09;color:#f4efe6;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">` +
  `<div style="text-align:center;padding:40px;background:#151310;border:1px solid #2a251e;border-radius:16px">` +
  `<h1 style="font-size:22px;margin:0 0 6px">${title}</h1><p style="color:#a79f93;margin:0">${body}</p></div></body></html>`

let inFlight: Promise<void> | null = null

/**
 * Signs in the same way app.loboguara.net/install.sh does (RFC 8252 loopback):
 * the browser confirms once and redirects the token to a one-shot local listener.
 */
export function signInToLoboGuara(): Promise<void> {
  // Why share one flow: a second launch while the browser is open would otherwise
  // open another tab and orphan the first listener.
  inFlight ??= runSignIn().finally(() => {
    inFlight = null
  })
  return inFlight
}

function runSignIn(): Promise<void> {
  const state = randomBytes(16).toString('hex')
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      closeServer(server)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const reply = (response: ServerResponse, status: number, html: string): void => {
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(html)
    }

    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/auth/callback') {
        response.writeHead(404)
        response.end()
        return
      }
      const token = url.searchParams.get('token')
      // Why: a stray loopback probe with the wrong state must not end the user's sign-in.
      if (url.searchParams.get('state') !== state || !token) {
        reply(response, 400, page('Link inválido ou expirado', 'Tente entrar de novo pelo Orca.'))
        return
      }
      try {
        saveLoboGuaraToken(token)
      } catch (error) {
        reply(response, 500, page('Não foi possível salvar o login', 'Tente de novo pelo Orca.'))
        finish(error instanceof Error ? error : new Error('loboguara_token_save_failed'))
        return
      }
      reply(response, 200, page('Login concluído', 'Pode voltar para o Orca.'))
      finish()
    })

    const timeout = setTimeout(
      () => finish(new Error('Lobo-Guará sign-in timed out.')),
      SIGN_IN_TIMEOUT_MS
    )
    server.once('close', () => clearTimeout(timeout))
    server.once('error', (error) => finish(error))
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        finish(new Error('Lobo-Guará sign-in could not open a local port.'))
        return
      }
      const authorize = new URL('/authorize', LOBO_GUARA_WEB_URL)
      authorize.searchParams.set('redirect', `http://127.0.0.1:${address.port}/auth/callback`)
      authorize.searchParams.set('state', state)
      authorize.searchParams.set('client', 'cli')
      shell.openExternal(authorize.toString()).catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error('Could not open the browser.'))
      })
    })
  })
}

function closeServer(server: Server): void {
  server.close()
  server.closeAllConnections()
}
