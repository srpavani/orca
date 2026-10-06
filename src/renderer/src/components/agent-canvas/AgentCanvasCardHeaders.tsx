import React from 'react'
import { ArrowLeft, ArrowRight, Globe, LockKeyhole, RotateCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type {
  CanvasFileTreeContent,
  CanvasNode,
  CanvasNoteContent,
  CanvasPortalContent,
  CanvasSessionContent
} from '../../../../shared/spatial-canvas/types'
import type { CardAgentState } from './agent-canvas-card-status'
import { navigateCanvasPortal, renameCanvasNodeTo } from './agent-canvas-node-actions'
import { AgentCanvasCardName } from './AgentCanvasRenamePopover'
import { TerminalWindowIcon } from './AgentCanvasIcons'

/** Card header heights, in world px, from the reference's nodes. */
export const CARD_HEADER_HEIGHT = {
  session: 28,
  portal: 32,
  portalBar: 36,
  note: 16,
  fileTree: 40
} as const

/** The header strip's drag handle props; the card passes its gesture in. */
export type CardHeaderDrag = {
  'data-canvas-card-header': string
  onPointerDown: (event: React.PointerEvent) => void
}

const NAME_CLASS = 'min-w-0 truncate text-left text-xs font-medium text-foreground'

/** Agent states that ask for the user: the reference's attention dot. */
function needsAttention(state: CardAgentState): boolean {
  return state === 'blocked' || state === 'waiting'
}

/**
 * The reference's terminal header: h-7, a hairline under it, a 6% foreground
 * wash; the terminal glyph at 11px, the name (rename on double-click), then the
 * attention dot on the right, springing in when the agent needs the user.
 */
export function SessionCardHeader(props: {
  node: CanvasNode & { content: CanvasSessionContent }
  state: CardAgentState
  drag: CardHeaderDrag
  trailing?: React.ReactNode
}): React.JSX.Element {
  const { node, state } = props
  const attention = needsAttention(state)
  return (
    <header
      {...props.drag}
      className="flex shrink-0 cursor-grab items-center gap-1.5 border-b border-canvas-card-border px-2.5 active:cursor-grabbing"
      style={{
        height: CARD_HEADER_HEIGHT.session,
        backgroundColor: 'color-mix(in srgb, var(--foreground) 6%, transparent)'
      }}
    >
      <TerminalWindowIcon className="size-[11px] shrink-0 text-muted-foreground" />
      <AgentCanvasCardName
        nodeId={node.id}
        name={node.content.name ?? node.content.label}
        fallbackName={translate('auto.components.agentCanvas.terminalUntitled', 'Terminal')}
        label={translate('auto.components.agentCanvas.renameTerminal', 'Rename terminal')}
        placeholder={translate(
          'auto.components.agentCanvas.terminalNamePlaceholder',
          'Terminal name'
        )}
        className={NAME_CLASS}
        onRename={(name) => renameCanvasNodeTo(node.id, name)}
      />
      <span className="flex-1" />
      {props.trailing}
      {attention ? (
        <span
          role="status"
          aria-label={
            state === 'blocked'
              ? translate('auto.components.agentCanvas.stateBlocked', 'Waiting for you')
              : translate('auto.components.agentCanvas.stateWaiting', 'Waiting')
          }
          className="canvas-attention-dot size-2 shrink-0 rounded-full bg-destructive"
        />
      ) : null}
    </header>
  )
}

/** The reference's PortalHeader: globe, name, and the page's size on the right. */
export function PortalCardHeader(props: {
  node: CanvasNode & { content: CanvasPortalContent }
  drag: CardHeaderDrag
}): React.JSX.Element {
  const { node } = props
  return (
    <header
      {...props.drag}
      className="flex shrink-0 cursor-grab items-center gap-2 px-3 active:cursor-grabbing"
      style={{ height: CARD_HEADER_HEIGHT.portal }}
    >
      <Globe className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className={NAME_CLASS}>{hostOf(node.content.url)}</span>
      <span className="flex-1" />
      <span className="shrink-0 font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
        {Math.round(node.frame.width)} × {Math.round(node.frame.height)}
      </span>
    </header>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

function PortalNavButton(props: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      className="flex size-6 items-center justify-center rounded-full text-foreground/80 hover:bg-foreground/10 disabled:opacity-30"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

/**
 * The reference's PortalControlsBar: a back/forward/reload pill and the
 * address pill. The page is a sandboxed cross-origin frame, so its own history
 * is out of reach; back and forward stay disabled, as the reference's do on a
 * fresh page.
 */
export function PortalControlsBar(props: {
  node: CanvasNode & { content: CanvasPortalContent }
  onReload: () => void
}): React.JSX.Element {
  const { node } = props
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const display = node.content.url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const pill = 'flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-foreground/6 px-2.5 py-1'
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 px-2 py-1.5"
      style={{ height: CARD_HEADER_HEIGHT.portalBar }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 rounded-full bg-foreground/6 px-1 py-0.5">
        <PortalNavButton
          label={translate('auto.components.agentCanvas.portalBack', 'Back')}
          disabled
          onClick={() => undefined}
        >
          <ArrowLeft className="size-3.5" />
        </PortalNavButton>
        <PortalNavButton
          label={translate('auto.components.agentCanvas.portalForward', 'Forward')}
          disabled
          onClick={() => undefined}
        >
          <ArrowRight className="size-3.5" />
        </PortalNavButton>
        <PortalNavButton
          label={translate('auto.components.agentCanvas.portalReloadShort', 'Reload')}
          onClick={props.onReload}
        >
          <RotateCw className="size-3" />
        </PortalNavButton>
      </div>
      {editing ? (
        <form
          className={pill}
          onSubmit={(event) => {
            event.preventDefault()
            navigateCanvasPortal(node.id, draft)
            setEditing(false)
          }}
        >
          <Search className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          <input
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the reference focuses the address on edit
            autoFocus
            type="text"
            value={draft}
            spellCheck={false}
            aria-label={translate('auto.components.agentCanvas.portalAddress', 'Address')}
            placeholder={display}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setEditing(false)
              }
            }}
          />
        </form>
      ) : (
        <button
          type="button"
          aria-label={translate('auto.components.agentCanvas.portalAddress', 'Address')}
          className={cn(pill, 'text-left')}
          onClick={() => {
            setDraft(node.content.url)
            setEditing(true)
          }}
        >
          <Search className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
            {display === ''
              ? translate('auto.components.agentCanvas.portalAddressPlaceholder', 'Enter a URL…')
              : display}
          </span>
        </button>
      )}
    </div>
  )
}

/**
 * The reference's NoteHeader: a 16px strip of the paper with a 6% (10% dark)
 * wash, a lock when the body is read-only, and the name only once the user
 * pinned one.
 */
export function NoteCardHeader(props: {
  node: CanvasNode & { content: CanvasNoteContent }
  drag: CardHeaderDrag
  trailing?: React.ReactNode
}): React.JSX.Element {
  const { node } = props
  const name = node.content.pinnedName
  return (
    <div
      {...props.drag}
      className="relative flex shrink-0 cursor-grab items-center gap-1 px-2.5 active:cursor-grabbing"
      style={{ height: CARD_HEADER_HEIGHT.note }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'var(--canvas-header-tint)' }}
      />
      {node.content.readOnly ? (
        <LockKeyhole className="relative size-2 shrink-0 opacity-55" aria-hidden />
      ) : null}
      {name ? (
        <span className="relative truncate text-[10px] font-medium opacity-60">{name}</span>
      ) : null}
      <span className="flex-1" />
      {props.trailing}
    </div>
  )
}

/** The reference's FileTreeHeader: h-10, the folder name at 13px, a hairline under it. */
export function FileTreeCardHeader(props: {
  node: CanvasNode & { content: CanvasFileTreeContent }
  drag: CardHeaderDrag
}): React.JSX.Element {
  return (
    <div
      {...props.drag}
      className="flex shrink-0 cursor-grab items-center gap-1.5 border-b border-canvas-card-border px-3 active:cursor-grabbing"
      style={{ height: CARD_HEADER_HEIGHT.fileTree }}
    >
      <span
        className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
        title={props.node.content.rootName}
      >
        {props.node.content.rootName}
      </span>
    </div>
  )
}
