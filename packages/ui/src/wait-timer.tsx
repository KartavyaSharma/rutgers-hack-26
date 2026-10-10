'use client'

import { type ComponentProps, useEffect, useState } from 'react'
import { cn } from './cn'
import { Icon } from './icon'

export const WAIT_WARN_MINUTES = 10
export const WAIT_ALERT_MINUTES = 20

export interface WaitTimerProps extends Omit<ComponentProps<'span'>, 'children'> {
  since: string | Date
}

/**
 * Minutes waited, e.g. "4 min". Amber from WAIT_WARN_MINUTES; from WAIT_ALERT_MINUTES
 * it adds an alert icon and the word "Overdue". Never uses the nurse red.
 */
export function WaitTimer({ since, className, ...props }: WaitTimerProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  const start = typeof since === 'string' ? Date.parse(since) : since.getTime()
  const minutes = Number.isNaN(start) ? null : Math.max(0, Math.floor((now - start) / 60_000))
  const level =
    minutes === null || minutes < WAIT_WARN_MINUTES
      ? 'ok'
      : minutes < WAIT_ALERT_MINUTES
        ? 'warn'
        : 'alert'

  return (
    <span
      data-level={level}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap align-middle tabular-nums',
        level !== 'ok' && 'rounded-chip bg-warn-tint px-2.5 text-warn-ink',
        className,
      )}
      {...props}
    >
      {level === 'alert' ? <Icon name="alert" className="size-[1.1em]" /> : null}
      <time dateTime={minutes === null ? undefined : `PT${minutes}M`} suppressHydrationWarning>
        {minutes === null ? '–' : `${minutes} min`}
      </time>
      {level === 'alert' ? <span className="font-bold">Overdue</span> : null}
    </span>
  )
}
