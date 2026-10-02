/** Stable error codes the canvas RPC methods surface to the CLI and the renderer. */
export const AGENT_CANVAS_ERROR_CODES = [
  'canvas_caller_not_on_canvas',
  'canvas_peer_not_found',
  'canvas_peer_not_connected',
  'canvas_peer_ambiguous',
  'canvas_peer_not_running',
  'canvas_note_not_found',
  'canvas_note_not_connected',
  'canvas_note_read_only'
] as const

export type AgentCanvasErrorCode = (typeof AGENT_CANVAS_ERROR_CODES)[number]
