/** Stable error codes the canvas RPC methods surface to the CLI and the renderer. */
export const AGENT_CANVAS_ERROR_CODES = [
  'canvas_caller_not_on_canvas',
  'canvas_peer_not_found',
  'canvas_peer_not_connected',
  'canvas_peer_ambiguous',
  'canvas_peer_not_running',
  'canvas_note_not_found',
  'canvas_note_not_connected',
  'canvas_note_read_only',
  'canvas_note_edit_no_match',
  'canvas_label_taken',
  'canvas_floor_not_found',
  'canvas_recruit_failed',
  'canvas_not_lead',
  'canvas_floor_exists',
  'canvas_role_not_found',
  'canvas_role_exists',
  'canvas_role_edit_no_match',
  'canvas_role_invalid',
  'canvas_project_not_found'
] as const

export type AgentCanvasErrorCode = (typeof AGENT_CANVAS_ERROR_CODES)[number]
