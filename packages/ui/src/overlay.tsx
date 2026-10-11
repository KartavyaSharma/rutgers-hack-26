'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { Button } from './button'
import { cn } from './cn'
import { useT } from './text'

interface OverlayBase {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Portal target; pass the nearest [data-theme] element so the overlay follows its theme. */
  container?: HTMLElement | null
  className?: string
}

function Overlay({
  open,
  onOpenChange,
  container,
  describedBy,
  className,
  children,
}: OverlayBase & { describedBy: boolean; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6">
          <DialogPrimitive.Content
            // Without a description, tell Radix there is nothing to describe the dialog.
            {...(describedBy ? {} : { 'aria-describedby': undefined })}
            className={cn(
              'pointer-events-auto flex max-h-full flex-col text-ink outline-none',
              className,
            )}
          >
            {children}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export type DialogTone = 'default' | 'nurse'

export interface DialogProps extends OverlayBase {
  /** "nurse" (red top edge and title) is only for "Your nurse has been told". */
  tone?: DialogTone
  /** Small line above the title, e.g. You said “…”. */
  eyebrow?: ReactNode
  title: string
  /** Accent line under the title, e.g. "Request sent". */
  status?: string
  /** Content between the title (and status) and the body, e.g. a list of what was sent. */
  children?: ReactNode
  /** Main text. */
  body?: string
  /** The buttons. Each should close or move on; there is no hidden close. */
  actions: ReactNode
}

/** Centered message dialog: "Request sent", "Your nurse has been told". */
export function Dialog({
  tone = 'default',
  eyebrow,
  title,
  status,
  children,
  body,
  actions,
  className,
  ...overlay
}: DialogProps) {
  return (
    <Overlay
      {...overlay}
      describedBy={Boolean(body)}
      className={cn(
        'w-dialog max-w-full gap-3 rounded-xl bg-surface p-10',
        tone === 'nurse' && 'border-t-[14px] border-nurse',
        className,
      )}
    >
      {eyebrow ? <p className="text-body text-muted">{eyebrow}</p> : null}
      <DialogPrimitive.Title
        className={cn(
          'font-heading text-display-lg leading-tight',
          tone === 'nurse' ? 'text-nurse-ink' : 'text-ink',
        )}
      >
        {title}
      </DialogPrimitive.Title>
      {status ? <p className="text-label font-bold text-action-ink">{status}</p> : null}
      {children}
      {body ? (
        <DialogPrimitive.Description className="text-lead leading-body">
          {body}
        </DialogPrimitive.Description>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">{actions}</div>
    </Overlay>
  )
}

/** Wraps a button so pressing it closes the surrounding Dialog or Sheet. */
export const DialogClose = DialogPrimitive.Close

export interface SheetProps extends OverlayBase {
  title: string
  children: ReactNode
  /** Label of the button that closes the sheet. Default "Done". */
  doneLabel?: string
  /** Fixed height with a scrolling body (My requests). */
  fill?: boolean
}

/** Titled panel with a Done button: Language, Your room, My requests. */
export function Sheet({
  title,
  children,
  doneLabel,
  fill = false,
  className,
  ...overlay
}: SheetProps) {
  const t = useT()
  return (
    <Overlay
      {...overlay}
      describedBy={false}
      className={cn(
        'w-sheet max-w-full gap-5 rounded-xl bg-bg p-8',
        fill && 'h-[660px]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <DialogPrimitive.Title className="font-heading text-display leading-tight">
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Close asChild>
          <Button variant="primary" size="md" className="px-8">
            {doneLabel ?? t('Done')}
          </Button>
        </DialogPrimitive.Close>
      </div>
      <div className={cn(fill && 'min-h-0 flex-1 overflow-y-auto')}>{children}</div>
    </Overlay>
  )
}
