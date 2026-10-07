/**
 * Ask back, as in the reference: while A waits on `ask B`, B can answer with
 * `ask A "<result>"`, and that message becomes A's reply in full. Why: scraping a
 * TUI screen loses anything past one page and differs per agent (Claude Code,
 * Codex, …); a reply the peer sends itself is exact for every vendor.
 */
type AskBackWaiter = {
  /** The session blocked in `ask`. */
  caller: string
  /** The session it asked, the only one allowed to answer it. */
  target: string
  resolve: (reply: string) => void
}

const waiters = new Set<AskBackWaiter>()

export type AskBackSlot = {
  reply: Promise<string>
  dispose(): void
}

/** Opens a slot `target` can fill by asking `caller` back. */
export function awaitAskBack(caller: string, target: string): AskBackSlot {
  let waiter: AskBackWaiter | null = null
  const reply = new Promise<string>((resolve) => {
    waiter = { caller, target, resolve }
    waiters.add(waiter)
  })
  return {
    reply,
    dispose: () => {
      if (waiter !== null) {
        waiters.delete(waiter)
      }
    }
  }
}

/**
 * Hands `message` from `from` to the oldest ask `to` is waiting on with `from`.
 * Returns false when no such ask is open, so the caller delivers it as a prompt.
 */
export function deliverAskBack(from: string, to: string, message: string): boolean {
  for (const waiter of waiters) {
    if (waiter.caller === to && waiter.target === from) {
      waiters.delete(waiter)
      waiter.resolve(message)
      return true
    }
  }
  return false
}
