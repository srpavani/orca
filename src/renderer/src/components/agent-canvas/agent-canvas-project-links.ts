import React from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAgentCanvas } from './agent-canvas-store'

/** A wire from a session on this board to one on another project's board. */
export type CanvasProjectLink = { linkId: string; sessionId: string; peer: string; project: string }

const LOCAL_RUNTIME = { kind: 'local' } as const
const POLL_MS = 4000

/**
 * Project links touching the board shown, polled while a card needs them. Why
 * polled: links change when an agent recruits into another project, which is
 * not a document change on this board.
 */
export function useCanvasProjectLinks(): {
  links: readonly CanvasProjectLink[]
  remove: (linkId: string) => void
} {
  const projectKey = useAgentCanvas((state) => state.projectKey)
  const [links, setLinks] = React.useState<readonly CanvasProjectLink[]>([])
  const refresh = React.useCallback(async (): Promise<void> => {
    if (projectKey === null) {
      setLinks([])
      return
    }
    try {
      const result = await callRuntimeRpc<{ links: CanvasProjectLink[] }>(
        LOCAL_RUNTIME,
        'canvas.links',
        { projectKey }
      )
      setLinks(result.links)
    } catch {
      // An older runtime has no links; the board simply shows none.
    }
  }, [projectKey])
  React.useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])
  const remove = (linkId: string): void => {
    setLinks((current) => current.filter((link) => link.linkId !== linkId))
    void callRuntimeRpc(LOCAL_RUNTIME, 'canvas.linkRemove', { linkId }).finally(
      () => void refresh()
    )
  }
  return { links, remove }
}
