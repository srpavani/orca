import { Notification } from 'electron'

export type AgentCanvasNotifyResult = { delivered: boolean; reason?: string }

/**
 * Sends a desktop notification. An agent uses this to reach the user when the
 * work is done and nobody is watching the terminal — the one message that is
 * worth interrupting them for.
 */
export function notifyUser(message: string, title?: string): AgentCanvasNotifyResult {
  if (!Notification.isSupported()) {
    return { delivered: false, reason: 'unsupported' }
  }
  // Why held in a local until shown: Electron drops a Notification that is garbage
  // collected before its click handler can fire.
  const notification = new Notification({
    title: title?.trim() || 'Orca',
    body: message
  })
  notification.show()
  return { delivered: true }
}
