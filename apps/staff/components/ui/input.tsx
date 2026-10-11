import { cn } from 'cn'
import type * as React from 'react'

/** Pill text field, 44 px tall (the note field under a plan, login fields). */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-full border border-border bg-card px-[18px] text-sm text-foreground transition-[color,box-shadow,border-color] outline-none placeholder:text-faint selection:bg-foreground selection:text-background file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-input focus-visible:ring-[3px] focus-visible:ring-ring/15',
        'aria-invalid:border-alert aria-invalid:ring-alert/15',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
