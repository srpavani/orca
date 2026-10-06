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
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  CANVAS_BACKGROUND_STYLES,
  CANVAS_CONNECTION_STYLES,
  CANVAS_SELECTION_STYLES,
  documentAppearance,
  type CanvasAppearance,
  type CanvasBackgroundStyle,
  type CanvasConnectionStyle,
  type CanvasSelectionStyle
} from '../../../../shared/spatial-canvas/canvas-appearance'
import { closeAppearanceSheet, useAppearanceSheetOpen } from './agent-canvas-appearance-sheet'
import { useAgentCanvas } from './agent-canvas-store'
import { setCanvasAppearance } from './agent-canvas-document-setters'

const BACKGROUND_LABELS: Record<CanvasBackgroundStyle, () => string> = {
  grid: () => translate('auto.components.agentCanvas.backgroundGrid', 'Grid'),
  plain: () => translate('auto.components.agentCanvas.backgroundPlain', 'Plain'),
  transparent: () => translate('auto.components.agentCanvas.backgroundTransparent', 'Transparent')
}

const CONNECTION_LABELS: Record<CanvasConnectionStyle, () => string> = {
  avoidNodes: () => translate('auto.components.agentCanvas.connectionAvoidNodes', 'Around nodes'),
  behindNodes: () => translate('auto.components.agentCanvas.connectionBehindNodes', 'Behind nodes'),
  circuit: () => translate('auto.components.agentCanvas.connectionCircuit', 'Circuit')
}

const SELECTION_LABELS: Record<CanvasSelectionStyle, () => string> = {
  dashedBorder: () => translate('auto.components.agentCanvas.selectionDashed', 'Dashed border'),
  solidBorder: () => translate('auto.components.agentCanvas.selectionSolid', 'Solid border'),
  corners: () => translate('auto.components.agentCanvas.selectionCorners', 'Corners'),
  cornerDots: () => translate('auto.components.agentCanvas.selectionCornerDots', 'Corner dots'),
  elevation: () => translate('auto.components.agentCanvas.selectionElevation', 'Elevation')
}

/**
 * Canvas appearance: the board's background, how a wire behaves where it meets a
 * card, and how a selected card is marked. Every option is one the reference
 * offers, and the defaults are the ones it ships — so this sheet changes what is
 * already there rather than picking a look for the user.
 */
export function AgentCanvasAppearanceDialog(): React.JSX.Element | null {
  const open = useAppearanceSheetOpen()
  if (!open) {
    return null
  }
  return <AppearanceBody />
}

function AppearanceBody(): React.JSX.Element {
  const document = useAgentCanvas((state) => state.document)
  const [draft, setDraft] = React.useState<CanvasAppearance>(() => documentAppearance(document))

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          closeAppearanceSheet()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.agentCanvas.appearanceTitle', 'Canvas appearance')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.agentCanvas.appearanceDescription',
              'Set up the canvas and the objects on it.'
            )}
          </DialogDescription>
        </DialogHeader>

        <Row
          label={translate('auto.components.agentCanvas.background', 'Background')}
          options={CANVAS_BACKGROUND_STYLES.map((value) => ({
            value,
            label: BACKGROUND_LABELS[value]()
          }))}
          selected={draft.background}
          onSelect={(background) => setDraft((current) => ({ ...current, background }))}
        />
        <Row
          label={translate('auto.components.agentCanvas.connectionStyle', 'Connections')}
          options={CANVAS_CONNECTION_STYLES.map((value) => ({
            value,
            label: CONNECTION_LABELS[value]()
          }))}
          selected={draft.connectionStyle}
          onSelect={(connectionStyle) => setDraft((current) => ({ ...current, connectionStyle }))}
        />
        <Row
          label={translate('auto.components.agentCanvas.selectionStyle', 'Selection')}
          options={CANVAS_SELECTION_STYLES.map((value) => ({
            value,
            label: SELECTION_LABELS[value]()
          }))}
          selected={draft.selectionStyle}
          onSelect={(selectionStyle) => setDraft((current) => ({ ...current, selectionStyle }))}
        />

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={closeAppearanceSheet}>
            {translate('auto.components.agentCanvas.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setCanvasAppearance(draft)
              closeAppearanceSheet()
            }}
          >
            {translate('auto.components.agentCanvas.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row<T extends string>(props: {
  label: string
  options: readonly { value: T; label: string }[]
  selected: T
  onSelect: (value: T) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{props.label}</span>
      <div className="flex flex-wrap gap-1.5">
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => props.onSelect(option.value)}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-xs',
              props.selected === option.value
                ? 'border-canvas-accent bg-canvas-accent-soft text-foreground'
                : 'border-border text-muted-foreground hover:bg-foreground/5'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
