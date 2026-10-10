'use client'

import type { ComponentProps, ReactNode } from 'react'
import { cn, focusRing, pressable } from './cn'

export type RequestTileTone = 'default' | 'nurse'

export interface RequestTileProps extends Omit<ComponentProps<'button'>, 'children' | 'onClick'> {
  label: string
  hint?: string | null
  /** Usually <Icon name={GROUP_ICON[group.id]} />; sized by the tile. */
  icon?: ReactNode
  onPress: () => void
  /** "nurse" is only for tiles that go straight to the nurse. */
  tone?: RequestTileTone
}

const TONES: Record<RequestTileTone, { tile: string; chip: string }> = {
  default: {
    tile: 'border-border bg-surface text-ink active:border-action-ink',
    chip: 'bg-action-tint text-action-ink',
  },
  nurse: {
    tile: 'border-nurse-tint bg-nurse-tint text-nurse-ink active:border-nurse',
    chip: 'bg-nurse text-on-nurse',
  },
}

/** Large home-screen request tile. Fills its grid cell; at least --size-tile tall. */
export function RequestTile({
  label,
  hint,
  icon,
  onPress,
  tone = 'default',
  className,
  type = 'button',
  ...props
}: RequestTileProps) {
  const styles = TONES[tone]

  return (
    <button
      type={type}
      data-tone={tone}
      onClick={() => onPress()}
      className={cn(
        'flex h-full min-h-tile w-full flex-col items-start justify-between gap-3 rounded-md border-2 p-5 text-start font-body shadow-raised active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        pressable,
        focusRing,
        styles.tile,
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-chip [&>svg]:size-8',
            styles.chip,
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="flex flex-col gap-1">
        <span className="text-lead font-bold">{label}</span>
        {hint ? <span className="text-body text-muted">{hint}</span> : null}
      </span>
    </button>
  )
}
