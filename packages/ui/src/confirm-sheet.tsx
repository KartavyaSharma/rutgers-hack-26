'use client'

import type { ReactNode } from 'react'
import { Icon } from './icon'
import { RoomButton } from './room-button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './sheet'
import { StatusPill, type StatusPillStatus } from './status-pill'

export interface ConfirmSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Say who the request went to, e.g. "Sent to your care aide". */
  title: string
  description?: string
  /** What happens next, e.g. "They'll come to your room soon." Shown with a clock icon. */
  nextStep?: string
  status?: StatusPillStatus
  children?: ReactNode
  /** Footer buttons. Defaults to one big button that closes the sheet; pass `false` for none. */
  actions?: ReactNode
  /** Label of the default close button. Default "OK". */
  okLabel?: string
  /** Portal target; pass the nearest [data-theme] element to follow a subtree's theme. */
  container?: HTMLElement | null
  className?: string
}

/** Bottom sheet for confirmations: who the request went to and what happens next. */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  nextStep,
  status,
  children,
  actions,
  okLabel = 'OK',
  container,
  className,
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        container={container}
        className={className}
        // Without a description, tell Radix there is nothing to describe the dialog.
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <SheetHeader>
          {status ? <StatusPill status={status} /> : null}
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        {nextStep ? (
          <p className="flex items-start gap-3 rounded-sm bg-bg p-4 text-lead text-ink">
            <Icon name="clock" className="mt-0.5 size-7 text-action-ink" />
            <span>{nextStep}</span>
          </p>
        ) : null}
        {children}
        {actions === false ? null : (
          <SheetFooter>
            {actions ?? (
              <SheetClose asChild>
                <RoomButton size="lg" className="w-full sm:w-auto sm:min-w-48">
                  {okLabel}
                </RoomButton>
              </SheetClose>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
