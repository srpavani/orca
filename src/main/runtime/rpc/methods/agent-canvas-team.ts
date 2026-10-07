import { defineMethod } from '../core'
import {
  AgentCanvasConnectParams,
  AgentCanvasInputParams,
  AgentCanvasNoteCreateParams,
  AgentCanvasNoteEditParams
} from '../../../../shared/rpc-contract/agent-canvas-params'
import { sendRawToConnectedPeer } from '../../../agent-canvas/agent-canvas-ask'
import { connectTeamSessions } from '../../../agent-canvas/agent-canvas-connect'
import { createConnectedNote, editConnectedNote } from '../../../agent-canvas/agent-canvas-note-ops'
import { resolveConnectedNote } from '../../../agent-canvas/agent-canvas-peers'
import { withTransfer } from '../../../agent-canvas/agent-canvas-transfers'
import { callerOf, transferEdges } from './agent-canvas'
import { teamPeerOf } from './agent-canvas-talk'

/** Team verbs from the reference: raw keys into a peer, wiring teammates, creating and editing notes. */
export const AGENT_CANVAS_TEAM_METHODS = [
  defineMethod({
    name: 'canvas.input',
    params: AgentCanvasInputParams,
    handler: async (params, { runtime }) => {
      const team = await callerOf(runtime, params)
      const { peer } = teamPeerOf(runtime, team, params.to)
      return withTransfer(transferEdges(team.snapshot, team.caller, peer.sessionId), () =>
        sendRawToConnectedPeer({
          snapshot: team.snapshot,
          runtime,
          callerSessionId: team.caller,
          target: params.to,
          text: params.text,
          peer
        })
      )
    }
  }),
  defineMethod({
    name: 'canvas.connect',
    params: AgentCanvasConnectParams,
    handler: async (params, { runtime }) => {
      const { caller, snapshot, store } = await callerOf(runtime, params)
      // Why validated before the write: a refused join must not bump the revision.
      const joined = connectTeamSessions(
        snapshot,
        caller,
        params.from,
        params.to,
        new Date().toISOString()
      )
      if (!joined.result.created) {
        return { ...joined.result, revision: snapshot.revision }
      }
      const saved = store.update((current) => ({ ...current, document: joined.document }))
      return { ...joined.result, revision: saved.revision }
    }
  }),
  defineMethod({
    name: 'canvas.noteCreate',
    params: AgentCanvasNoteCreateParams,
    handler: async (params, { runtime }) => {
      const { caller, snapshot, store } = await callerOf(runtime, params)
      const created = createConnectedNote(
        snapshot,
        caller,
        { body: params.body, name: params.name ?? null },
        new Date().toISOString()
      )
      const saved = store.update(() => created.snapshot)
      return { note: resolveConnectedNote(saved, caller, created.noteId), revision: saved.revision }
    }
  }),
  defineMethod({
    name: 'canvas.noteEdit',
    params: AgentCanvasNoteEditParams,
    handler: async (params, { runtime }) => {
      const { caller, store } = await callerOf(runtime, params)
      // Why the id first: an edit to the first line can rename an unpinned note.
      const { noteId } = resolveConnectedNote(store.get(), caller, params.note)
      const next = editConnectedNote(store.get(), caller, noteId, params.oldText, params.newText)
      const saved = store.update(() => next)
      return { note: resolveConnectedNote(saved, caller, noteId), revision: saved.revision }
    }
  })
]
