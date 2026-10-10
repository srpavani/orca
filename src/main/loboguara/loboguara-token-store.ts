import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { hardenExistingSecureFile, writeSecureFile } from '../../shared/secure-file'

const TOKEN_FILE = 'loboguara-token.enc'
const ENVELOPE_PREFIX = 'orca-loboguara-token:v1:'
let cachedToken: string | null = null

function tokenPath(): string {
  return join(app.getPath('userData'), TOKEN_FILE)
}

export function hasLoboGuaraToken(): boolean {
  return cachedToken !== null || existsSync(tokenPath())
}

export function saveLoboGuaraToken(token: string): void {
  const trimmed = token.trim()
  if (!trimmed) {
    throw new Error('Lobo-Guará token is empty')
  }
  const sealed = safeStorage.isEncryptionAvailable()
  const payload = sealed ? safeStorage.encryptString(trimmed) : Buffer.from(trimmed, 'utf8')
  writeSecureFile(
    tokenPath(),
    `${ENVELOPE_PREFIX}${sealed ? 'encrypted' : 'plaintext'}:${payload.toString('base64')}`
  )
  cachedToken = trimmed
}

export function readLoboGuaraToken(): string | null {
  if (cachedToken !== null) {
    return cachedToken
  }
  const path = tokenPath()
  if (!existsSync(path)) {
    return null
  }
  try {
    hardenExistingSecureFile(path)
  } catch (error) {
    console.warn('[loboguara] Failed to harden token file', error)
  }
  const text = readFileSync(path, 'utf8')
  const match = text.startsWith(ENVELOPE_PREFIX)
    ? /^(encrypted|plaintext):(.*)$/s.exec(text.slice(ENVELOPE_PREFIX.length))
    : null
  if (!match) {
    return null
  }
  const payload = Buffer.from(match[2], 'base64')
  if (match[1] === 'plaintext') {
    cachedToken = payload.toString('utf8')
  } else if (safeStorage.isEncryptionAvailable()) {
    cachedToken = safeStorage.decryptString(payload)
  } else {
    return null
  }
  return cachedToken
}

export function clearLoboGuaraToken(): void {
  cachedToken = null
  rmSync(tokenPath(), { force: true })
}
