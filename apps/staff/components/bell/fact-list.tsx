import type { Fact } from '@bell/core/hospital'
import { cn } from 'cn'

/** Plain label / value rows. Alert values (real allergy, DNR) are red. One column unless asked. */
export function FactList({
  facts,
  columns = 1,
  labelWidth = 82,
  className,
}: {
  facts: Fact[]
  columns?: 1 | 2 | 3
  /** Width of the label column in px (82 in the dialog, 76 in the Incoming side panel). */
  labelWidth?: number
  className?: string
}) {
  return (
    <dl
      className={cn('m-0 grid gap-x-6 gap-y-2 text-sm leading-[1.35]', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {facts.map((f) => (
        <div
          key={f.label}
          className="grid gap-x-3"
          style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }}
        >
          <dt className="text-ink-soft">{f.label}</dt>
          <dd className={cn('m-0 font-semibold', f.alert && 'text-alert')}>{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}
