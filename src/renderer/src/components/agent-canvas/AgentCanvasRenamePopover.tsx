import React from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

/** Card ids whose name field should open its rename popover (the reference's renameRequestNodeIdAtom). */
const requests = new Set<(nodeId: string) => void>()

export function requestCanvasRename(nodeId: string): void {
  for (const listener of requests) {
    listener(nodeId)
  }
}

function RenameForm(props: {
  currentName: string
  label: string
  placeholder: string
  onRename: (name: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [draft, setDraft] = React.useState(props.currentName)
  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  const trimmed = draft.trim()
  const valid = trimmed.length > 0 && trimmed !== props.currentName
  const submit = (): void => {
    props.onRename(trimmed)
    props.onClose()
  }
  return (
    <div className="flex flex-col gap-2.5">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={120}
        aria-label={props.label}
        placeholder={props.placeholder}
        className="h-8 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (valid) {
              submit()
            }
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onClose()
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={props.onClose}>
          {translate('auto.components.agentCanvas.cancel', 'Cancel')}
        </Button>
        <Button size="sm" disabled={!valid} onClick={submit}>
          {translate('auto.components.agentCanvas.rename', 'Rename')}
        </Button>
      </div>
    </div>
  )
}

/**
 * The reference's RenamePopover around a card's name: double-click, Enter or
 * F2 on the name, or Rename from the card's menu, opens a small form under it.
 */
export function AgentCanvasCardName(props: {
  nodeId: string
  name: string
  fallbackName: string
  label: string
  placeholder: string
  className: string
  onRename: (name: string) => void
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const listener = (nodeId: string): void => {
      if (nodeId === props.nodeId) {
        setOpen(true)
      }
    }
    requests.add(listener)
    return () => {
      requests.delete(listener)
    }
  }, [props.nodeId])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          title={props.label}
          aria-label={props.label}
          className={props.className}
          onDoubleClick={(event) => {
            event.stopPropagation()
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'F2') {
              event.preventDefault()
              setOpen(true)
            }
          }}
        >
          {props.name || props.fallbackName}
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-64"
        onPointerDownCapture={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <RenameForm
          currentName={props.name}
          label={props.label}
          placeholder={props.placeholder}
          onRename={props.onRename}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
