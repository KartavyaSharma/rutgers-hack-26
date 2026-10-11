'use client'

import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'
import { useT } from './text'

export interface OptionTileProps {
  label: string
  /** Short second line, e.g. "A cup or a pitcher". */
  sub?: string
  onPress: () => void
  disabled?: boolean
  className?: string
}

/** One option on a category screen. Tapping it sends the request. */
export function OptionTile({ label, sub, onPress, disabled, className }: OptionTileProps) {
  return (
    <button
      type="button"
      onClick={() => onPress()}
      disabled={disabled}
      className={cn(
        'flex min-h-0 flex-col justify-center rounded-sm bg-surface px-[18px] text-left text-ink',
        'disabled:cursor-progress disabled:opacity-60',
        pressable,
        focusRing,
        className,
      )}
    >
      <span className="text-[22px] leading-tight font-bold">{label}</span>
      {sub ? <span className="mt-[3px] text-[16px] leading-tight text-muted">{sub}</span> : null}
    </button>
  )
}

export interface SomethingElseTileProps {
  onPress: () => void
  className?: string
}

/** Last tile on every category screen. It will become typing; for now it opens the mic. */
export function SomethingElseTile({ onPress, className }: SomethingElseTileProps) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={() => onPress()}
      className={cn(
        'flex min-h-0 items-center gap-3 rounded-sm border-2 border-dashed border-border px-[18px] text-left text-action-ink',
        pressable,
        focusRing,
        className,
      )}
    >
      <Icon name="keyboard" className="size-7" />
      <span className="flex flex-col">
        <span className="text-[22px] leading-tight font-bold">{t('Something else')}</span>
        <span className="mt-[3px] text-[16px] leading-tight text-muted">
          {t('Say it out loud or tap here to type')}
        </span>
      </span>
    </button>
  )
}
