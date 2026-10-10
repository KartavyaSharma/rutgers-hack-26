'use client'

import type { ReactNode } from 'react'
import { Button } from './button'
import { cn } from './cn'
import { Icon, type IconName } from './icon'
import { Dialog, DialogClose } from './overlay'

export interface SentItem {
  id: string
  /** What was asked for, never a team name, e.g. "Clean up a spill". */
  label: string
  icon?: IconName
  /** Went straight to the nurse (red flag, clinical, or an AI failure). */
  nurse?: boolean
}

export interface SentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Everything one spoken request turned into, in the order it arrived. */
  items: readonly SentItem[]
  /** The patient's words, when they are one utterance. */
  heard?: string
  /** "Follow it": open My requests. */
  onFollow: () => void
  container?: HTMLElement | null
}

const NURSE_TOLD = 'Your nurse has been told'
const NURSE_BODY =
  'They can see your call now. If you feel worse, press the red button on your bed rail.'

/**
 * Confirms what a spoken request turned into. One item: "Request sent" (or the red "Your nurse
 * has been told"). Several, e.g. "a spill and some water" in one sentence: "Both sent" or
 * "All sent" with each item listed, red-edged with "Your nurse has been told" first when any
 * of them went straight to the nurse.
 */
export function SentDialog({ items, heard, onFollow, ...overlay }: SentDialogProps) {
  const nurseNow = items.some((item) => item.nurse)
  const okay = (variant: 'primary' | 'nurse') => (
    <DialogClose asChild>
      <Button variant={variant} size="lg">
        Okay
      </Button>
    </DialogClose>
  )
  const follow = (
    <Button variant="secondary" size="lg" onClick={onFollow}>
      Follow it
    </Button>
  )

  const [only] = items
  if (items.length <= 1) {
    if (only?.nurse) {
      return (
        <Dialog
          {...overlay}
          tone="nurse"
          title={NURSE_TOLD}
          body={NURSE_BODY}
          actions={okay('nurse')}
        />
      )
    }
    return (
      <Dialog
        {...overlay}
        eyebrow={heard ? `You said “${heard}”` : undefined}
        title={only?.label ?? ''}
        status="Request sent"
        body="Someone will be with you soon. You don't need to ask again."
        actions={
          <>
            {okay('primary')}
            {follow}
          </>
        }
      />
    )
  }

  let eyebrow: ReactNode
  if (nurseNow) eyebrow = <strong className="font-bold text-nurse">{NURSE_TOLD}</strong>
  else if (heard) eyebrow = `You said “${heard}”`

  return (
    <Dialog
      {...overlay}
      tone={nurseNow ? 'nurse' : 'default'}
      eyebrow={eyebrow}
      title={items.length === 2 ? 'Both sent' : 'All sent'}
      body="Someone's coming. You don't need to ask again."
      actions={
        <>
          {okay(nurseNow ? 'nurse' : 'primary')}
          {follow}
        </>
      }
    >
      <ul className="my-1 flex max-h-[40vh] flex-col gap-3 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-4">
            <span
              className={cn(
                'flex size-disc shrink-0 items-center justify-center rounded-pill',
                item.nurse ? 'bg-nurse-tint text-nurse-ink' : 'bg-action-tint text-action-ink',
              )}
            >
              <Icon name={item.nurse ? 'alert' : (item.icon ?? 'mic')} className="size-8" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-heading text-display leading-tight">{item.label}</span>
              {item.nurse ? (
                <span className="text-body font-bold text-nurse">{NURSE_TOLD}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
