import type { ComponentProps } from 'react'
import { cn, focusRing, pressable } from './cn'

export type RoomButtonVariant = 'primary' | 'secondary' | 'ghost' | 'nurse'
export type RoomButtonSize = 'md' | 'lg'

const BASE =
  'inline-flex min-w-tap items-center justify-center gap-3 rounded-sm text-center font-body font-bold disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'

const VARIANTS: Record<RoomButtonVariant, string> = {
  primary: 'bg-action text-on-action shadow-raised active:brightness-90',
  secondary: 'bg-action-tint text-ink active:inset-ring-2 active:inset-ring-action-ink',
  ghost: 'bg-transparent text-action-ink hover:bg-action-tint active:bg-action-tint',
  // Nurse colors are reserved for calling the nurse or urgent actions.
  nurse: 'bg-nurse text-on-nurse shadow-raised active:brightness-90',
}

const SIZES: Record<RoomButtonSize, string> = {
  md: 'min-h-tap px-6 py-2 text-lead',
  lg: 'min-h-tap-lg px-8 py-3 text-title',
}

/** Class string for anything that should look like a RoomButton (e.g. a Next <Link>). */
export function roomButtonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: RoomButtonVariant
  size?: RoomButtonSize
  className?: string | undefined
} = {}): string {
  return cn(BASE, pressable, focusRing, VARIANTS[variant], SIZES[size], className)
}

export interface RoomButtonProps extends ComponentProps<'button'> {
  variant?: RoomButtonVariant
  size?: RoomButtonSize
}

/** General-purpose button: 64px tall (md) or 72px (lg). Defaults to type="button". */
export function RoomButton({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: RoomButtonProps) {
  return (
    <button
      type={type}
      className={roomButtonClasses({ variant, size, className })}
      data-variant={variant}
      {...props}
    />
  )
}
