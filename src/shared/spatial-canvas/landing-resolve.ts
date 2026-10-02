/**
 * The message the reference sends to an agent when a landing hits conflicts.
 * It reads like a transcript the agent can act on: the two commands that would
 * reproduce the conflict, the conflicted paths, and the user's own note after a
 * separator. Kept byte-for-byte with the reference's `buildResolvePrompt`.
 */
export function buildResolvePrompt(
  source: string,
  target: string,
  files: readonly string[],
  comment: string
): string {
  const lines = [
    `$ git checkout ${target}`,
    `$ git merge ${source === '' ? '<source>' : source}`,
    ...files.map((path) => `CONFLICT: ${path}`)
  ]
  const trimmed = comment.trim()
  if (trimmed !== '') {
    lines.push('---')
    lines.push(trimmed)
  }
  return lines.join('\n')
}

/** Agents a conflict can be sent to: the canvas's session cards, by name. */
export type ResolveAgent = { sessionId: string; name: string }
