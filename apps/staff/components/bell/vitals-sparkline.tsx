'use client'

import { cn } from '@/lib/utils'

const W = 88
const H = 30

/** Smooth path through points, flat at each point (same curve as the canvas). */
function curve(points: [number, number][]) {
  return points
    .map(([x, y], i) => {
      const prev = points[i - 1]
      if (!prev) return `M${x.toFixed(1)} ${y.toFixed(1)}`
      const [px, py] = prev
      const dx = (x - px) / 2
      return `C${(px + dx).toFixed(1)} ${py.toFixed(1)} ${(x - dx).toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/** Tiny trend line for the Patients table (HR, BP, O2). Latest value shown as text; red when out of range. */
export function VitalsSparkline({
  label,
  values,
  low,
  high,
  unit,
}: {
  label: string
  values: number[]
  low?: number
  high?: number
  unit?: string
}) {
  const last = values.at(-1)
  const out =
    last !== undefined && ((low !== undefined && last < low) || (high !== undefined && last > high))

  // Scale over the values and the normal range, with a little room above and below.
  const all = [
    ...values,
    ...(low !== undefined ? [low] : []),
    ...(high !== undefined ? [high] : []),
  ]
  let min = Math.min(...all)
  let max = Math.max(...all)
  const pad = (max - min) * 0.18 || 1
  min -= pad
  max += pad
  const n = values.length
  const x = (i: number) => ((i + 0.5) * W) / n
  const y = (v: number) => H - ((v - min) / (max - min)) * H
  const points = values.map((v, i) => [x(i), y(v)] as [number, number])
  const lastPoint = points.at(-1)

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-baseline justify-between gap-1">
        <span className="font-semibold text-[11px] text-muted-foreground">{label}</span>
        <b className={cn('text-[13px] tabular-nums', out ? 'text-alert' : 'text-foreground')}>
          {last ?? '–'}
          {last !== undefined ? (unit ?? '') : ''}
        </b>
      </span>
      {n > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
          className={cn('block', out ? 'text-alert' : 'text-foreground')}
        >
          {low !== undefined && high !== undefined && (
            <rect
              x={0}
              y={y(high)}
              width={W}
              height={y(low) - y(high)}
              rx={2}
              fill="var(--chart-band)"
            />
          )}
          <path
            d={curve(points)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
          />
          {lastPoint && <circle cx={lastPoint[0]} cy={lastPoint[1]} r={2.5} fill="currentColor" />}
        </svg>
      )}
    </div>
  )
}
