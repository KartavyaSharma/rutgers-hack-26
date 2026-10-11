import type { PatientRequest } from '@bell/core/staff-api'
import { cn } from 'cn'
import { UrgencyTag } from './urgency-tag'

const toneText: Record<PatientRequest['tone'], string> = {
  needs_you: 'font-bold text-foreground',
  stuck: 'font-semibold text-high-foreground',
  active: 'text-ink-soft',
  done: 'text-faint',
}

// Stacked (what, then status) for narrow panels; three columns (what, who, status) for the dialog.
const layout = {
  stacked: {
    box: 'flex flex-col gap-px py-2',
    who: 'hidden',
    status: 'text-[13px]',
  },
  row: {
    box: 'grid min-h-[46px] grid-cols-[minmax(0,1fr)_190px_200px] items-center gap-4 py-1.5',
    who: 'block',
    status: 'text-sm',
  },
  // Picks one by the width of the list it sits in.
  auto: {
    box: 'flex flex-col gap-px py-2 @[34rem]:grid @[34rem]:min-h-[46px] @[34rem]:grid-cols-[minmax(0,1fr)_190px_200px] @[34rem]:items-center @[34rem]:gap-4 @[34rem]:py-1.5',
    who: 'hidden @[34rem]:block',
    status: 'text-[13px] @[34rem]:text-sm',
  },
} as const

/**
 * One request: what, who has it, status, styled by tone (needs you, stuck, active, done).
 * Default `auto` shows three columns when there is room (patient dialog) and stacks in a narrow panel.
 */
export function RequestRow({
  request,
  variant = 'auto',
}: {
  request: PatientRequest
  variant?: 'auto' | 'row' | 'stacked'
}) {
  const l = layout[variant]
  return (
    <div
      className={cn('@container border-b border-subtle', request.tone === 'done' && 'opacity-60')}
    >
      <div className={cn('text-sm', l.box)}>
        <span className="flex min-w-0 items-center gap-2">
          <UrgencyTag tier={request.tier} />
          <b className="truncate font-semibold">{request.what}</b>
        </span>
        <span className={cn('truncate text-ink-soft', l.who)}>{request.who}</span>
        <span className={cn('flex min-w-0 items-center gap-1.5', l.status, toneText[request.tone])}>
          {request.tone === 'stuck' ? (
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-stuck" />
          ) : null}
          <span className="truncate">{request.status}</span>
        </span>
      </div>
    </div>
  )
}
