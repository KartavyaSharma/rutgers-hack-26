import type { ComponentProps } from 'react'
import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'

export interface HelpButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'onClick'> {
  onPress: () => void
  /** True while the call is being sent. */
  busy?: boolean
  label?: string
  busyLabel?: string
}

/** The big red "I need help immediately" card. Red is reserved for this and urgent states. */
export function HelpButton({
  onPress,
  busy = false,
  label = 'I need help immediately',
  busyLabel = 'Calling your nurse…',
  className,
  type = 'button',
  disabled,
  ...props
}: HelpButtonProps) {
  return (
    <button
      type={type}
      onClick={() => onPress()}
      disabled={disabled || busy}
      aria-busy={busy}
      className={cn(
        'flex min-h-[180px] flex-col justify-between rounded-lg bg-nurse p-7 text-left text-on-nurse',
        'disabled:cursor-progress',
        pressable,
        focusRing,
        className,
      )}
      {...props}
    >
      <span className="flex size-disc-lg items-center justify-center rounded-pill bg-on-nurse-disc">
        <Icon name="alert" className="size-10" />
      </span>
      <span className="font-heading text-display leading-tight">{busy ? busyLabel : label}</span>
    </button>
  )
}
