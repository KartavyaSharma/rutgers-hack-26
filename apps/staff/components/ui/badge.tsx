import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Slot } from 'radix-ui'
import type * as React from 'react'

// Quiet status pill ("Accepted", "Sent back"). Urgency uses UrgencyTag, not this.
const badgeVariants = cva(
  'inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-[9px] text-xs font-semibold whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-subtle text-ink-strong [a&]:hover:bg-column',
        secondary: 'bg-column text-ink-strong [a&]:hover:bg-rail',
        high: 'bg-high text-high-foreground',
        destructive: 'bg-urgent text-urgent-foreground [a&]:hover:bg-urgent/90',
        outline: 'border-input bg-card text-ink-soft [a&]:hover:bg-subtle',
        ghost: 'text-ink-soft [a&]:hover:bg-subtle',
        link: 'text-foreground underline-offset-4 [a&]:hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
