import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureDevLauncher } from './cli-dev-launcher'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('ensureDevLauncher on Windows', () => {
  it('also writes a POSIX twin so Git Bash resolves the command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-dev-launcher-'))
    roots.push(root)
    const cliEntryPath = join(root, 'out', 'cli', 'index.js')
    await mkdir(join(root, 'out', 'cli'), { recursive: true })
    await writeFile(cliEntryPath, '')
    const launcher = await ensureDevLauncher({
      platform: 'win32',
      userDataPath: join(root, 'user-data'),
      execPath: 'C:\\Orca\\electron.exe',
      cliEntryPath,
      commandName: 'orca-dev'
    })
    expect(launcher?.endsWith('orca-dev.cmd')).toBe(true)
    const twin = await readFile(join(root, 'user-data', 'cli', 'bin', 'orca'), 'utf8')
    expect(twin.startsWith('#!/usr/bin/env bash')).toBe(true)
    expect(twin).toContain("ELECTRON='C:/Orca/electron.exe'")
    expect(twin).not.toContain('\\')
  })
})
