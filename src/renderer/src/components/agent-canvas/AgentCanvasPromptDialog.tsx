import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { closeCanvasPrompt, useCanvasPrompt, type CanvasPromptRequest } from './agent-canvas-prompt'

/**
 * The one dialog behind every canvas question. Mounted once by the page; the
 * caller only describes the question and what to do with the answer.
 */
export function AgentCanvasPromptDialog(): React.JSX.Element | null {
  const request = useCanvasPrompt()
  if (request === null) {
    return null
  }
  // Why keyed on the request id: a new question must start with its own value
  // instead of inheriting the previous answer.
  return <PromptBody key={request.id} request={request} />
}

function PromptBody(props: { request: CanvasPromptRequest }): React.JSX.Element {
  const { request } = props
  const [value, setValue] = React.useState(request.initialValue ?? '')
  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = (): void => {
    if (request.kind === 'text' && value.trim().length === 0) {
      return
    }
    const answer = value.trim()
    closeCanvasPrompt()
    request.onSubmit(answer)
  }

  const confirmLabel =
    request.confirmLabel ??
    (request.kind === 'text'
      ? translate('auto.components.agentCanvas.create', 'Create')
      : translate('auto.components.agentCanvas.confirm', 'Confirm'))

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          closeCanvasPrompt()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          {request.description ? (
            <DialogDescription>{request.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {request.kind === 'text' ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            {request.label ? <Label htmlFor="agent-canvas-prompt">{request.label}</Label> : null}
            <Input
              id="agent-canvas-prompt"
              ref={inputRef}
              value={value}
              placeholder={request.placeholder}
              onChange={(event) => setValue(event.target.value)}
            />
            <DialogFooter className="mt-2">
              <Button type="button" variant="ghost" onClick={closeCanvasPrompt}>
                {translate('auto.components.agentCanvas.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={value.trim().length === 0}>
                {confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            {request.kind === 'confirm' ? (
              <Button variant="ghost" onClick={closeCanvasPrompt}>
                {translate('auto.components.agentCanvas.cancel', 'Cancel')}
              </Button>
            ) : null}
            <Button variant={request.destructive ? 'destructive' : 'default'} onClick={submit}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
