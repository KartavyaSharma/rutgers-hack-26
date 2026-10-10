import type { ComponentProps } from 'react'
import { cn } from './cn'

/** Same strings as RequestStatus in @bell/core/taxonomy. */
export type StatusPillStatus = 'sent' | 'seen' | 'on_the_way' | 'done'

const STEPS: readonly StatusPillStatus[] = ['sent', 'seen', 'on_the_way', 'done']

export const STATUS_PILL_LABELS: Record<StatusPillStatus, string> = {
  sent: 'Sent',
  seen: 'Seen',
  on_the_way: 'On the way',
  done: 'Done',
}

export interface StatusPillProps extends Omit<ComponentProps<'span'>, 'children'> {
  status: StatusPillStatus
  /** Override the word (keep it a word: color is never the only signal). */
  label?: string
}

const STYLES: Record<StatusPillStatus, string> = {
  sent: 'bg-state-sent text-state-sent-ink inset-ring-2 inset-ring-border',
  seen: 'bg-state-seen text-state-seen-ink',
  on_the_way: 'bg-state-on-the-way text-state-on-the-way-ink',
  done: 'bg-state-done text-state-done-ink',
}

/**
 * Request status: the word plus four step dots (sent, seen, on the way, done), filled up
 * to the current step. Color only reinforces the word and the dots.
 */
export function StatusPill({ status, label, className, ...props }: StatusPillProps) {
  const step = STEPS.indexOf(status)

  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-chip py-1 ps-3 pe-4 font-body text-body font-bold',
        STYLES[status],
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={cn(
              'size-2.5 rounded-full border-2 border-current',
              i <= step ? 'bg-current' : 'bg-transparent',
            )}
          />
        ))}
      </span>
      {label ?? STATUS_PILL_LABELS[status]}
    </span>
  )
}
