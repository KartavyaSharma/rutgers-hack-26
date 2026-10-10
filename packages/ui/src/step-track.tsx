import { cn } from './cn'

/** The patient's four steps, in order. Same strings as REQUEST_STEPS in @bell/core/taxonomy. */
export const STEPS = ['sent', 'seen', 'on_the_way', 'done'] as const
export type Step = (typeof STEPS)[number]
/** A request status: a step, or cancelled. */
export type StepStatus = Step | 'cancelled'

export const STEP_LABELS: Record<StepStatus, string> = {
  sent: 'Sent',
  seen: 'Seen',
  on_the_way: 'On the way',
  done: 'Done',
  cancelled: 'Cancelled',
}

export interface StepTrackProps {
  status: StepStatus
  /** Override the words (e.g. translated). */
  labels?: Partial<Record<StepStatus, string>>
  className?: string
}

/**
 * Four segments, Sent · Seen · On the way · Done. Every step has its word under it and the
 * current one is bold, so progress never relies on color alone. Cancelled shows one word.
 */
export function StepTrack({ status, labels, className }: StepTrackProps) {
  const words = { ...STEP_LABELS, ...labels }
  if (status === 'cancelled') {
    return <p className={cn('text-body font-bold text-muted', className)}>{words.cancelled}</p>
  }
  const current = STEPS.indexOf(status)
  return (
    <ol className={cn('grid grid-cols-4 gap-2', className)} aria-label={`Status: ${words[status]}`}>
      {STEPS.map((step, i) => (
        <li
          key={step}
          className="flex flex-col gap-1.5"
          aria-current={i === current ? 'step' : undefined}
        >
          <span
            aria-hidden="true"
            className={cn('h-2 rounded-pill', i <= current ? 'bg-action' : 'bg-border')}
          />
          <span
            className={cn(
              'text-body leading-tight',
              i === current ? 'font-bold text-action-ink' : 'text-muted',
            )}
          >
            {words[step]}
          </span>
        </li>
      ))}
    </ol>
  )
}
