import { cn } from './cn'
import { Icon } from './icon'

export interface ChartNoticeProps {
  title: string
  body?: string
  className?: string
}

/** Why some options are missing or need care, from the patient's chart. Never red. */
export function ChartNotice({ title, body, className }: ChartNoticeProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3.5 rounded-[18px] border-2 border-border bg-surface px-[18px] py-3.5',
        className,
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-bg text-muted">
        <Icon name="lock" className="size-5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-[21px] leading-tight font-bold">{title}</span>
        {body ? <span className="text-[17px] leading-snug text-muted">{body}</span> : null}
      </span>
    </div>
  )
}

export interface ChartTagsProps {
  tags: readonly string[]
  className?: string
}

/** Quiet tags when the menus were only filtered, e.g. "Low sugar diet", "No peanuts". */
export function ChartTags({ tags, className }: ChartTagsProps) {
  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {tags.map((tag) => (
        <li
          key={tag}
          className="flex h-10 items-center gap-2 rounded-pill bg-surface px-3.5 text-[18px] font-bold"
        >
          <Icon name="info" className="size-5 text-muted" />
          {tag}
        </li>
      ))}
    </ul>
  )
}
