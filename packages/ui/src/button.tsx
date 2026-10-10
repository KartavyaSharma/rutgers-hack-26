import type { ComponentProps } from 'react'
import { cn, focusRing, pressable } from './cn'
import { Icon, type IconName } from './icon'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'nurse'
/** md 64px (the minimum tap target), lg 72px (dialogs), xl 88px (the main actions). */
export type ButtonSize = 'md' | 'lg' | 'xl'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-action text-on-action',
  secondary: 'border-border bg-transparent text-ink active:bg-action-tint',
  ghost: 'border-transparent bg-transparent text-muted active:bg-action-tint',
  // Red is reserved for the nurse and urgent help.
  nurse: 'border-transparent bg-nurse text-on-nurse',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-tap gap-2 px-6 text-body',
  lg: 'min-h-tap-lg gap-3 px-10 text-lead',
  xl: 'min-h-tap-xl gap-3 px-8 text-label',
}

const ICON_SIZES: Record<ButtonSize, string> = {
  md: 'size-6',
  lg: 'size-7',
  xl: 'size-[30px]',
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant | undefined
  size?: ButtonSize | undefined
  className?: string | undefined
} = {}): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-pill border-2 font-body font-bold leading-tight',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
    pressable,
    focusRing,
    VARIANTS[variant],
    SIZES[size],
    className,
  )
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Leading icon. */
  icon?: IconName
  /** Color for the icon only, e.g. "text-action-ink" on a secondary button. */
  iconClassName?: string
}

/** Pill button. Always a real <button>, at least 64px tall, with a visible word. */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconClassName,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses({ variant, size, className })} {...props}>
      {icon ? <Icon name={icon} className={cn(ICON_SIZES[size], iconClassName)} /> : null}
      {children}
    </button>
  )
}
