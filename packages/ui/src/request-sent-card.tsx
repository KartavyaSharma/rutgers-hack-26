'use client'

import { useEffect, useEffectEvent } from 'react'
import { Button } from './button'
import { cn } from './cn'
import { Icon, type IconName } from './icon'

export interface SentCardItem {
  id: string
  /** What was sent, never a team name, e.g. "An extra pillow". */
  label: string
  icon?: IconName
}

export interface RequestSentCardProps {
  /** What was just sent (one spoken sentence can send several). */
  items: readonly SentCardItem[]
  /** The voice session is still open: show "Still listening". */
  listening: boolean
  /** "Looks good", and what happens when the timer runs out. */
  onDone: () => void
  /** "Delete": cancel what was just sent. */
  onDelete: () => void
  deleting?: boolean
  /** Seconds before the card closes by itself. */
  seconds?: number
  /** Change it to restart the timer (e.g. when another request joins the card). */
  resetKey?: string | number
  className?: string
}

/**
 * MRSentB1: "Request sent" shown in place of the Make a request panel, with "Looks good" and
 * "Delete". A stroke drains around the card's edge over `seconds`; when it runs out the card closes
 * as if "Looks good" was tapped. Under reduced motion the edge stays still and says when it closes.
 */
export function RequestSentCard({
  items,
  listening,
  onDone,
  onDelete,
  deleting = false,
  seconds = 10,
  resetKey,
  className,
}: RequestSentCardProps) {
  // The timer: restarts when resetKey changes; holds off while deleting.
  const timeUp = useEffectEvent(() => onDone())
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey restarts the timer on purpose
  useEffect(() => {
    if (deleting) return
    const timer = setTimeout(timeUp, seconds * 1000)
    return () => clearTimeout(timer)
  }, [seconds, resetKey, deleting])

  const several = items.length > 1
  return (
    <section
      aria-label="Request sent"
      className={cn(
        'relative flex min-w-0 flex-col justify-center gap-3 rounded-lg bg-surface px-11 py-10 text-ink',
        className,
      )}
    >
      {/* The timer edge: a full outline that drains around the card. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full overflow-visible text-action"
      >
        <rect
          key={resetKey}
          x="2"
          y="2"
          rx="30"
          pathLength={100}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray="100"
          className="motion-safe:animate-drain"
          style={{
            width: 'calc(100% - 4px)',
            height: 'calc(100% - 4px)',
            animationDuration: `${seconds}s`,
          }}
        />
      </svg>

      {listening ? (
        <div className="ml-5 flex items-center gap-10 self-start">
          <span aria-hidden="true" className="relative size-24 shrink-0">
            <span className="absolute inset-0 rounded-pill bg-action/30 motion-safe:animate-ripple" />
            <span className="absolute inset-0 rounded-pill bg-action/30 motion-safe:animate-ripple [animation-delay:1s]" />
            <span className="absolute inset-0 flex items-center justify-center rounded-pill bg-action text-on-action">
              <Icon name="mic" className="size-[42px]" strokeWidth={2.2} />
            </span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-title font-bold">Still listening</span>
            <span className="text-lead text-muted">To change the request, just talk.</span>
          </span>
        </div>
      ) : null}

      <p className={cn('text-label font-bold text-action-ink', listening && 'mt-9')}>
        Request sent
      </p>
      <ul className={cn('flex flex-col', several ? 'gap-3' : 'gap-0')}>
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-4">
            {item.icon ? (
              <span
                aria-hidden="true"
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-pill bg-action-tint text-action-ink',
                  several ? 'size-disc' : 'size-disc-lg',
                )}
              >
                <Icon name={item.icon} className={several ? 'size-8' : 'size-10'} />
              </span>
            ) : null}
            <span
              className={cn(
                'font-heading leading-tight',
                several ? 'text-display' : 'text-display-xl',
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-label text-muted">Someone is coming.</p>
      <p className="hidden text-body text-muted motion-reduce:block">Closes in {seconds} s</p>

      <div className="mt-9 flex gap-3.5">
        <Button variant="primary" size="xl" icon="check" onClick={onDone} className="flex-[2]">
          Looks good
        </Button>
        <Button
          variant="secondary"
          size="xl"
          onClick={onDelete}
          disabled={deleting}
          aria-busy={deleting}
          className="flex-1 bg-surface"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </section>
  )
}
