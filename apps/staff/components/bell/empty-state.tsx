import { cn } from 'cn'
import type { ReactNode } from 'react'

/** Calm empty or error state. */
export function EmptyState({
  title,
  detail,
  action,
  className,
}: {
  title: string
  detail?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 px-4 py-12 text-center',
        className,
      )}
    >
      <p className="m-0 text-[15px] font-medium text-ink-soft">{title}</p>
      {detail ? <p className="m-0 text-[13px] text-faint">{detail}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
