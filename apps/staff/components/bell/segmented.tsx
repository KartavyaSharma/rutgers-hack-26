'use client'

import { cn } from 'cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  count?: number
}

/**
 * Two or three way switch, e.g. "Mine / Everyone" (pill) or "To approve 9 / Bell handled 3" (block,
 * equal-width, for a list header). Defaults to block when any option has a count.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  variant,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  className?: string
  variant?: 'pill' | 'block'
  /** Accessible name for the group, e.g. "Whose patients". */
  label?: string
}) {
  const block =
    (variant ?? (options.some((o) => o.count !== undefined) ? 'block' : 'pill')) === 'block'
  return (
    // biome-ignore lint/a11y/useSemanticElements: a pill switch, not a form fieldset
    <div
      role="group"
      aria-label={label}
      className={cn(
        block
          ? 'grid gap-1 rounded-[10px] bg-border p-1'
          : 'inline-flex w-fit gap-0.5 rounded-[19px] bg-[#ECE7DF] p-[3px]',
        className,
      )}
      style={
        block ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined
      }
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-1 text-sm whitespace-nowrap text-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
              block ? 'h-9 rounded-lg px-3' : 'h-8 rounded-2xl px-4',
              on
                ? 'bg-card font-bold shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'font-medium hover:bg-card/50',
            )}
          >
            {o.label}
            {o.count === undefined ? null : (
              <span className="font-medium text-muted-foreground tabular-nums">{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
