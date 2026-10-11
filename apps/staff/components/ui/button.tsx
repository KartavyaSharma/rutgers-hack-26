import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Slot } from 'radix-ui'
import type * as React from 'react'

// Canvas buttons: rounded pills. One ink-filled primary per area, white outlines, quiet ghosts.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary font-bold text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-urgent font-bold text-urgent-foreground hover:bg-urgent/90',
        outline:
          'border border-input bg-card font-semibold text-foreground hover:bg-subtle aria-expanded:bg-subtle',
        secondary: 'bg-subtle font-semibold text-foreground hover:bg-column',
        ghost: 'text-ink-soft hover:bg-subtle hover:text-foreground aria-expanded:bg-subtle',
        link: 'font-semibold text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 has-[>svg]:pl-3.5',
        xs: "h-7 gap-1 px-3 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-4 text-[13px] has-[>svg]:pl-3 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 px-6 has-[>svg]:pl-5',
        icon: 'size-10',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
