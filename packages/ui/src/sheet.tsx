'use client'

// Bottom sheet on @radix-ui/react-dialog, in the shape of shadcn/ui's Sheet, styled with tokens.

import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps } from 'react'
import { cn, focusRing } from './cn'
import { Icon } from './icon'

export function Sheet(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />
}

export function SheetTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

export function SheetClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

export function SheetPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />
}

export function SheetOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  )
}

export interface SheetContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  /**
   * Where to portal the sheet (default document.body). Pass the nearest
   * [data-theme] element when the sheet must follow a subtree's theme.
   */
  container?: HTMLElement | null
  /** Show the round close button in the top corner. Default true. */
  showClose?: boolean
  /** Accessible name of the close button. Default "Close". */
  closeLabel?: string
}

export function SheetContent({
  className,
  children,
  container,
  showClose = true,
  closeLabel = 'Close',
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal container={container}>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-3xl flex-col gap-6 overflow-y-auto rounded-t-xl border-border border-t bg-surface p-8 font-body text-body text-ink shadow-raised outline-none data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            className={cn(
              'absolute top-4 right-4 flex size-tap items-center justify-center rounded-full text-muted transition-colors duration-(--motion-duration) hover:bg-bg active:bg-bg',
              focusRing,
            )}
          >
            <Icon name="close" className="size-7" />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </SheetPortal>
  )
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col items-start gap-3 pe-16', className)}
      {...props}
    />
  )
}

export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        'font-heading text-heading text-ink [font-weight:var(--heading-weight)]',
        className,
      )}
      {...props}
    />
  )
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-lead text-muted', className)}
      {...props}
    />
  )
}
