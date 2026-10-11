import { cn } from 'cn'

/** The patient's own words, with how and when they asked, e.g. "By voice · 22 min ago". */
export function QuoteBlock({
  words,
  meta,
  size = 'lg',
  className,
}: {
  words: string
  meta?: string
  /** lg: the big quote at the top of a request. sm: a quote inside a list or panel. */
  size?: 'sm' | 'lg'
  className?: string
}) {
  const lg = size === 'lg'
  return (
    <figure
      className={cn(
        'm-0 flex flex-col gap-1 bg-background',
        lg ? 'gap-1.5 rounded-xl px-5 py-4' : 'rounded-[10px] px-3.5 py-3',
        className,
      )}
    >
      <blockquote
        className={cn('m-0 font-semibold leading-[1.35]', lg ? 'text-xl' : 'text-[15px]')}
      >
        “{words}”
      </blockquote>
      {meta ? <figcaption className="text-[13px] text-ink-soft">{meta}</figcaption> : null}
    </figure>
  )
}
