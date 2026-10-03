import React from 'react'
import { levelContents } from '../../../../shared/spatial-canvas/levels'
import {
  getAgentCanvasState,
  selectCanvasNode,
  selectCanvasNodes,
  setCanvasViewState
} from './agent-canvas-store'
import { copyCanvasSelectionNow, deleteCanvasSelection } from './agent-canvas-selection-actions'

/**
 * The board's keys: Delete/Backspace removes the whole selection, Ctrl+A
 * selects every card on the floor in view, Ctrl+C copies the selection, and
 * Escape drops the draw tool, then the selection, then leaves the canvas.
 * Keys typed into a live terminal, note or portal belong to it.
 */
export function useAgentCanvasKeys(closeCanvasPage: () => void): void {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Why the instanceof: a key event can target the window itself, which has no matches().
      const target = event.target instanceof Element ? event.target : null
      if (
        target?.matches(
          'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
        ) ||
        target?.closest('[data-canvas-live-pane]') ||
        document.querySelector('[role=dialog]')
      ) {
        return
      }
      const state = getAgentCanvasState()
      const mod = event.ctrlKey || event.metaKey
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selectedNodeIds.length > 0) {
          event.preventDefault()
          deleteCanvasSelection()
        }
      } else if (mod && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault()
        const floor = levelContents(state.document, state.activeLevelId) ?? state.document.root
        selectCanvasNodes(
          floor.nodes
            .filter((node) => node.content.kind !== 'bridge' && node.locked !== true)
            .map((node) => node.id)
        )
      } else if (mod && (event.key === 'c' || event.key === 'C')) {
        if (state.selectedNodeIds.length > 0) {
          event.preventDefault()
          copyCanvasSelectionNow()
        }
      } else if (event.key === 'Escape') {
        if (state.drawTool) {
          setCanvasViewState({ drawTool: null })
        } else if (state.selectedNodeIds.length > 0) {
          selectCanvasNode(null)
        } else {
          closeCanvasPage()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeCanvasPage])
}
