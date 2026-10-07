import React from 'react'
import { Palette, Pencil, Ungroup } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { worldRectToScreen } from '../../../../shared/spatial-canvas/geometry'
import {
  GROUP_COLORS,
  GROUP_COLOR_TOKENS,
  groupColorHex,
  groupFrame,
  type GroupColor
} from '../../../../shared/spatial-canvas/groups'
import type {
  CanvasGroup,
  CanvasLevelContents,
  CanvasLevelId,
  CanvasViewport
} from '../../../../shared/spatial-canvas/types'
import { recolorGroup, renameGroup, ungroupNodes } from './agent-canvas-group-actions'
import { openCanvasPrompt } from './agent-canvas-prompt'

/** The reference's frame metrics, in screen pixels (GROUP_HEADER_* / GROUP_CORNER_RADIUS). */
const HEADER_HEIGHT = 22
const HEADER_GAP = 6
const CORNER_RADIUS = 12
const COLORED_BORDER = 0.75
const NEUTRAL_BORDER = 0.35
const COLORED_FILL = 0.12

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Border and header tint, as the reference's groupTint computes them. */
function tint(token: string): { border: string; header: string } {
  const hex = groupColorHex(token)
  return hex
    ? { border: rgba(hex, COLORED_BORDER), header: rgba(hex, COLORED_FILL) }
    : {
        border: `color-mix(in srgb, var(--muted-foreground), transparent ${(1 - NEUTRAL_BORDER) * 100}%)`,
        header: 'transparent'
      }
}

const COLOR_LABELS: Record<Exclude<GroupColor, ''>, () => string> = {
  yellow: () => translate('auto.components.agentCanvas.noteColorYellow', 'Yellow'),
  pink: () => translate('auto.components.agentCanvas.noteColorPink', 'Pink'),
  blue: () => translate('auto.components.agentCanvas.noteColorBlue', 'Blue'),
  green: () => translate('auto.components.agentCanvas.noteColorGreen', 'Green'),
  orange: () => translate('auto.components.agentCanvas.noteColorOrange', 'Orange'),
  purple: () => translate('auto.components.agentCanvas.noteColorPurple', 'Purple')
}

/** Dashed frames around the floor's groups, drawn under the cards. */
export function AgentCanvasGroups(props: {
  contents: CanvasLevelContents
  levelId: CanvasLevelId
  viewport: CanvasViewport
}): React.JSX.Element | null {
  if (props.contents.groups.length === 0) {
    return null
  }
  return (
    <>
      {props.contents.groups.map((group) => {
        const world = groupFrame(props.contents, group)
        if (!world) {
          return null
        }
        return (
          <GroupFrame
            key={group.id}
            group={group}
            levelId={props.levelId}
            screen={worldRectToScreen(world, props.viewport)}
          />
        )
      })}
    </>
  )
}

function GroupFrame(props: {
  group: CanvasGroup
  levelId: CanvasLevelId
  screen: { x: number; y: number; width: number; height: number }
}): React.JSX.Element {
  const { group, screen, levelId } = props
  const colors = tint(group.colorToken)
  const name = group.label || translate('auto.components.agentCanvas.groupUntitled', 'Group')
  return (
    <>
      <div
        aria-hidden="true"
        data-canvas-group-id={group.id}
        className="pointer-events-none absolute"
        style={{
          left: screen.x,
          top: screen.y,
          width: screen.width,
          height: screen.height,
          borderRadius: CORNER_RADIUS,
          border: `1.5px dashed ${colors.border}`
        }}
      />
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            className="absolute flex items-center rounded-full px-2 text-[11px] text-muted-foreground hover:text-foreground"
            style={{
              left: screen.x,
              top: screen.y - HEADER_HEIGHT - HEADER_GAP,
              height: HEADER_HEIGHT,
              border: `1px solid ${colors.border}`,
              background: colors.header
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
            onDoubleClick={() => promptRename(levelId, group)}
          >
            {name}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => promptRename(levelId, group)}>
            <Pencil className="size-3.5" />
            {translate('auto.components.agentCanvas.rename', 'Rename')}…
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Palette className="size-3.5" />
              {translate('auto.components.agentCanvas.color', 'Color')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-40">
              <ContextMenuItem onSelect={() => recolorGroup(levelId, group.id, '')}>
                <span className="size-3 rounded-full border border-dashed border-muted-foreground" />
                {translate('auto.components.agentCanvas.groupColorNeutral', 'Neutral')}
              </ContextMenuItem>
              {GROUP_COLOR_TOKENS.map((color) => (
                <ContextMenuItem
                  key={color}
                  onSelect={() => recolorGroup(levelId, group.id, color)}
                >
                  <span
                    className="size-3 rounded-full border border-black/10"
                    style={{ backgroundColor: GROUP_COLORS[color] }}
                  />
                  {COLOR_LABELS[color]()}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => ungroupNodes(group.nodeIds)}>
            <Ungroup className="size-3.5" />
            {translate('auto.components.agentCanvas.ungroup', 'Ungroup')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </>
  )
}

function promptRename(levelId: CanvasLevelId, group: CanvasGroup): void {
  openCanvasPrompt({
    kind: 'text',
    title: translate('auto.components.agentCanvas.groupRename', 'Rename group'),
    label: translate('auto.components.agentCanvas.groupRenameLabel', 'Group name'),
    initialValue: group.label,
    confirmLabel: translate('auto.components.agentCanvas.save', 'Save'),
    onSubmit: (value) => renameGroup(levelId, group.id, value)
  })
}
