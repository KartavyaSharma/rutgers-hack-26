import { cn } from 'cn'

/** Plain status text for work with another team. Stuck shows a small amber dot and darker text. */
export function StatusLine({
  text,
  stuck = false,
  className,
}: {
  text: string
  stuck?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[13px]',
        stuck ? 'font-semibold text-high-foreground' : 'text-ink-soft',
        className,
      )}
    >
      {stuck ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-stuck" /> : null}
      {text}
    </span>
  )
}
