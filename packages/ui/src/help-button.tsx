'use client'

import type { ComponentProps } from 'react'
import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'
import { useT } from './text'

export interface HelpButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'onClick'> {
  onPress: () => void
  /** True while the call is being sent. */
  busy?: boolean
  label?: string
  busyLabel?: string
  /** tall: the voice only column; short: above the mic with voice only off. */
  size?: 'tall' | 'short'
}

/** The red "I have an emergency" button. Red is reserved for this and urgent states. */
export function HelpButton({
  onPress,
  busy = false,
  label = 'I have an emergency',
  busyLabel,
  size = 'tall',
  className,
  type = 'button',
  disabled,
  ...props
}: HelpButtonProps) {
  const t = useT()
  const short = size === 'short'
  return (
    <button
      type={type}
      onClick={() => onPress()}
      disabled={disabled || busy}
      aria-busy={busy}
      className={cn(
        'flex rounded-lg bg-nurse text-left text-on-nurse',
        short
          ? 'h-tile shrink-0 items-center gap-3.5 rounded-md px-5'
          : 'min-h-[180px] flex-col justify-between p-7',
        'disabled:cursor-progress',
        pressable,
        focusRing,
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-pill bg-on-nurse-disc',
          short ? 'size-[52px]' : 'size-disc-lg',
        )}
      >
        <Icon name="alert" className={short ? 'size-7' : 'size-10'} />
      </span>
      <span
        className={cn(
          'font-heading leading-tight',
          short ? 'text-[25px] leading-[1.1]' : 'text-display',
        )}
      >
        {busy ? (busyLabel ?? t('Calling your nurse…')) : label}
      </span>
    </button>
  )
}
