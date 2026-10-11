import type { ReactNode } from 'react'

/** One quiet "watch for" tag, e.g. "Fall risk". At most one per row. Overflow is plain muted text. */
export function WatchTag({ children, more = 0 }: { children: ReactNode; more?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="inline-flex h-[22px] items-center truncate rounded-[5px] bg-subtle px-2 text-xs font-semibold whitespace-nowrap text-[#3A342E]">
        {children}
      </span>
      {more > 0 ? (
        <span className="text-xs whitespace-nowrap text-muted-foreground">+{more} more</span>
      ) : null}
    </span>
  )
}
