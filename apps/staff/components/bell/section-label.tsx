import { cn } from 'cn'
import type { ReactNode } from 'react'

/** Small uppercase label above a section, e.g. "BELL SUGGESTS". Optional action on the right. */
export function SectionLabel({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-h-5 items-center justify-between gap-3', className)}>
      <h3 className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
        {children}
      </h3>
      {action}
    </div>
  )
}
