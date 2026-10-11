'use client'

import type { Task } from '@bell/core/staff-api'
import { cn } from 'cn'
import type { KeyboardEvent, ReactNode } from 'react'
import { OwnerLine } from '@/components/bell/owner-line'
import { UrgencyTag } from '@/components/bell/urgency-tag'
import { Button } from '@/components/ui/button'

/** Bell's suggested order (1 = first) for the signed-in nurse. `legend` is the key above the board. */
export function OrderBadge({
  n,
  inverted = false,
  legend = false,
}: {
  n: number
  inverted?: boolean
  legend?: boolean
}) {
  return (
    <span
      aria-hidden={legend || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold',
        legend ? 'size-[22px] text-xs' : 'size-5 text-[11px]',
        inverted ? 'bg-card text-urgent' : 'bg-foreground text-primary-foreground',
      )}
    >
      {legend ? null : <span className="sr-only">Bell’s order </span>}
      {n}
    </span>
  )
}

// Enter or Space on a card button must press the button, not pick up the card.
const keepKeys = (e: KeyboardEvent) => e.stopPropagation()

function CardButton({
  onClick,
  className,
  children,
}: {
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      onKeyDown={keepKeys}
      className={className}
    >
      {children}
    </Button>
  )
}

/** One task on the board. Urgent is filled red, done fades. No side accents. */
export function TaskCard({
  task,
  onTake,
  onDone,
  lifted = false,
}: {
  task: Task
  onTake?: (task: Task) => void
  onDone?: (task: Task) => void
  /** The copy that follows the pointer while dragging. */
  lifted?: boolean
}) {
  const urgent = task.tier === 'urgent'
  const done = task.status === 'done'
  const help = task.status === 'needs_help'
  const nobody = !task.owner?.id
  const canTake = !task.mine && (help || nobody)
  const canDone = task.mine && !done && !help
  const owner = task.owner && task.mine ? { ...task.owner, name: 'You' } : task.owner

  return (
    <article
      className={cn(
        'flex flex-col gap-1.5 rounded-[12px] py-3.5 pr-4 pl-5 shadow-[0_1px_2px_rgba(42,38,34,0.06)]',
        urgent ? 'bg-urgent text-urgent-foreground' : 'bg-card text-foreground',
        done && !lifted && 'opacity-55',
        lifted && 'shadow-[0_8px_24px_rgba(42,38,34,0.18)]',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {task.order && !done ? <OrderBadge n={task.order} inverted={urgent} /> : null}
        <span
          className={cn(
            'min-w-0 truncate text-[13px]',
            urgent ? 'text-urgent-foreground/82' : 'text-muted-foreground',
          )}
        >
          <b className={urgent ? 'text-urgent-foreground' : 'text-foreground'}>
            {task.patientName}
          </b>{' '}
          · {task.room}
        </span>
        <UrgencyTag tier={task.tier} inverted={urgent} className="ml-auto" />
      </span>

      <b className="text-base leading-[1.3]">{task.title}</b>

      {task.note ? (
        <span
          className={cn(
            'text-[13px] leading-[1.4]',
            help ? 'font-semibold' : urgent ? 'text-urgent-foreground/90' : 'text-ink-soft',
          )}
        >
          {task.note}
        </span>
      ) : null}

      {owner?.name ? <OwnerLine person={owner} inverted={urgent} className="mt-0.5" /> : null}

      <span className="flex min-h-8 items-center gap-2 text-[13px]">
        <span className="font-semibold">{task.timeLabel}</span>
        {canDone && onDone ? (
          <CardButton
            onClick={() => onDone(task)}
            className={cn('ml-auto font-bold', urgent && 'border-card text-alert hover:bg-card')}
          >
            Mark done
          </CardButton>
        ) : null}
      </span>

      {canTake && onTake ? (
        <span className="mt-1 flex gap-2">
          <CardButton onClick={() => onTake(task)} className="h-[34px] flex-1">
            I’ll do it
          </CardButton>
        </span>
      ) : null}
    </article>
  )
}
