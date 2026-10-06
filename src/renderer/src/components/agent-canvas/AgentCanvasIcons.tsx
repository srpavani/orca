import React from 'react'
import { Folder, Globe, MousePointer2, Pencil, Scroll } from 'lucide-react'
import type { CanvasMode } from './agent-canvas-mode'

/** The reference's Text-tool glyph: two letters drawn as an icon, not a word. */
const TEXT_GLYPH = 'Aa'

/**
 * The reference's TerminalWindow glyph, built with the same createLucideIcon
 * geometry: a 20x18 window (rx .83), a prompt chevron and an underscore. Drawn
 * with lucide's stroke defaults so it sits beside lucide icons unchanged.
 */
export function TerminalWindowIcon({
  className,
  size = 24
}: {
  className?: string
  size?: number
}): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="18" rx="0.83" />
      <polyline points="7 8.4 11.17 12 7 15.6" />
      <line x1="12.83" y1="15.6" x2="17" y2="15.6" />
    </svg>
  )
}

/** The reference's CanvasModeIcon: one glyph per main-toolbar mode. */
export function CanvasModeIcon({
  mode,
  className = 'size-5'
}: {
  mode: CanvasMode
  className?: string
}): React.JSX.Element {
  switch (mode) {
    case 'select':
      return <MousePointer2 className={className} />
    case 'terminal':
      return <TerminalWindowIcon className={className} />
    case 'note':
      return <Scroll className={className} />
    case 'text':
      return (
        <span
          aria-hidden="true"
          className={`${className} inline-flex items-center justify-center text-[16px] font-medium leading-none tracking-[-0.04em]`}
        >
          {TEXT_GLYPH}
        </span>
      )
    case 'draw':
      return <Pencil className={className} />
    case 'portal':
      return <Globe className={className} />
    case 'fileTree':
      return <Folder className={className} />
  }
}
