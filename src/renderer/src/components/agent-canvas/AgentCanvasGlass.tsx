import React from 'react'
import { cn } from '@/lib/utils'

/**
 * The reference's Glass / GlassToolbar / GlassButton / ToolbarDivider, class for
 * class. The pulse is the reference's ICON_PULSE_KEYFRAMES (scale 1 → 1.22 →
 * 0.97 → 1 over 0.38s at times 0/.32/.72/1), replayed on every click by
 * re-keying the icon span — the same trick the reference uses with `key={pulse}`.
 */
export function AgentCanvasGlassToolbar({
  className,
  children,
  strong,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean }): React.JSX.Element {
  return (
    <div
      className={cn(
        strong ? 'canvas-glass-strong' : 'canvas-glass',
        'flex items-center gap-1.5 rounded-full px-2 py-1.5',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function AgentCanvasToolbarDivider(): React.JSX.Element {
  return <span className="mx-1.5 h-5 w-[0.5px] shrink-0 bg-foreground/20" aria-hidden />
}

export function AgentCanvasGlassButton({
  className,
  active,
  label,
  children,
  onClick,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> & {
  active?: boolean
  label: string
}): React.JSX.Element {
  const [pulse, setPulse] = React.useState(0)
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[15px]',
        'transition-colors hover:bg-foreground/10 active:bg-foreground/10',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-40',
        // The reference (macOS ToolbarView.modeButton): the active tool tints its
        // icon to the accent, with no background pill.
        active ? 'text-canvas-accent' : 'text-foreground/85',
        className
      )}
      onClick={(event) => {
        setPulse((count) => count + 1)
        onClick?.(event)
      }}
      {...rest}
    >
      <span
        key={pulse}
        className={cn('inline-flex items-center justify-center', pulse > 0 && 'canvas-icon-pulse')}
      >
        {children}
      </span>
    </button>
  )
}
