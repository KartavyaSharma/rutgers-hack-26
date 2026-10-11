import { cn } from 'cn'
import type { ReactNode } from 'react'

/** Quiet line when a section has nothing yet, e.g. "No labs or tests yet." */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <span className="py-2 text-muted-foreground text-sm">{children}</span>
}

/** Two-line row with a value on the right (medicines, labs and tests). */
export function ListRow({
  title,
  sub,
  end,
  className,
}: {
  title: ReactNode
  sub: ReactNode
  end: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-subtle border-b text-sm tabular-nums',
        className,
      )}
    >
      <span className="flex min-w-0 flex-col gap-px">
        <b className="font-semibold">{title}</b>
        <span className="text-[13px] text-ink-soft">{sub}</span>
      </span>
      {end}
    </div>
  )
}
