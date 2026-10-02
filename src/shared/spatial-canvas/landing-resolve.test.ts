import { describe, expect, it } from 'vitest'
import { buildResolvePrompt } from './landing-resolve'

describe('buildResolvePrompt', () => {
  it('writes the commands and the conflicted paths', () => {
    expect(buildResolvePrompt('floor/a', 'main', ['src/x.ts', 'b.txt'], '')).toBe(
      '$ git checkout main\n$ git merge floor/a\nCONFLICT: src/x.ts\nCONFLICT: b.txt'
    )
  })

  it('appends the note after a separator, trimmed', () => {
    expect(buildResolvePrompt('floor/a', 'main', ['b.txt'], '  keep ours  ')).toBe(
      '$ git checkout main\n$ git merge floor/a\nCONFLICT: b.txt\n---\nkeep ours'
    )
  })

  it('names an unknown source as a placeholder', () => {
    expect(buildResolvePrompt('', 'main', [], '')).toBe('$ git checkout main\n$ git merge <source>')
  })
})
