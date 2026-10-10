import { LOBO_GUARA_API_URL, signInToLoboGuara } from './loboguara-sign-in'
import { clearLoboGuaraToken, hasLoboGuaraToken, readLoboGuaraToken } from './loboguara-token-store'

export type LoboGuaraLaunch = { env: Record<string, string>; envToDelete: string[] }

/** The env the `loboguara` wrapper from install.sh exports around `claude`. */
export function loboGuaraLaunchEnv(token: string): LoboGuaraLaunch {
  return {
    env: {
      ANTHROPIC_BASE_URL: LOBO_GUARA_API_URL,
      // Why AUTH_TOKEN, not API_KEY: Claude Code then skips its "custom API key" prompt.
      ANTHROPIC_AUTH_TOKEN: token,
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1'
    },
    // Why: an inherited key or OAuth token would outrank the gateway token.
    envToDelete: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']
  }
}

export async function prepareLoboGuaraLaunch(options: {
  signIn?: boolean
}): Promise<LoboGuaraLaunch | null> {
  let token = readLoboGuaraToken()
  if (!token && options.signIn) {
    await signInToLoboGuara()
    token = readLoboGuaraToken()
  }
  return token ? loboGuaraLaunchEnv(token) : null
}

export function loboGuaraStatus(): { signedIn: boolean } {
  return { signedIn: hasLoboGuaraToken() }
}

export function signOutOfLoboGuara(): { signedIn: false } {
  clearLoboGuaraToken()
  return { signedIn: false }
}
