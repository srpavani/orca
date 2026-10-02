import { describe, expect, it, vi } from 'vitest'
import {
  closeCanvasPrompt,
  getCanvasPrompt,
  openCanvasPrompt,
  useCanvasPrompt
} from './agent-canvas-prompt'

describe('canvas prompt store', () => {
  it('starts with no question open', () => {
    closeCanvasPrompt()
    expect(getCanvasPrompt()).toBeNull()
    expect(useCanvasPrompt).toBeTypeOf('function')
  })

  it('opens a question and hands its answer to the caller exactly once', () => {
    const onSubmit = vi.fn()
    openCanvasPrompt({ kind: 'text', title: 'New floor', onSubmit })
    const request = getCanvasPrompt()
    expect(request).toMatchObject({ kind: 'text', title: 'New floor' })
    expect(request?.id).toBeGreaterThan(0)

    request?.onSubmit('Experiment')
    expect(onSubmit).toHaveBeenCalledWith('Experiment')
  })

  it('replaces the previous question instead of queueing it', () => {
    const first = vi.fn()
    const second = vi.fn()
    openCanvasPrompt({ kind: 'text', title: 'First', onSubmit: first })
    openCanvasPrompt({ kind: 'confirm', title: 'Second', onSubmit: second })
    expect(getCanvasPrompt()?.title).toBe('Second')
    expect(first).not.toHaveBeenCalled()
  })

  it('closes, and closing twice is harmless', () => {
    openCanvasPrompt({ kind: 'notice', title: 'Only http(s) pages', onSubmit: () => {} })
    closeCanvasPrompt()
    closeCanvasPrompt()
    expect(getCanvasPrompt()).toBeNull()
  })

  it('gives every question its own id, so a dialog resets its input', () => {
    openCanvasPrompt({ kind: 'text', title: 'A', onSubmit: () => {} })
    const first = getCanvasPrompt()?.id
    openCanvasPrompt({ kind: 'text', title: 'B', onSubmit: () => {} })
    expect(getCanvasPrompt()?.id).not.toBe(first)
  })
})
