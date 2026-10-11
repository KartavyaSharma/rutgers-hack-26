'use client'

import type { VitalSeries } from '@bell/core/hospital'
import { Line, LineChart, ReferenceArea, ReferenceDot, XAxis, YAxis } from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { clock } from '@/lib/time'
import { cn } from '@/lib/utils'

const INK = 'var(--chart-line)'
const ALERT = 'var(--alert)'
/** Diastolic: a lighter second line (listed after systolic so the tooltip reads 132 then 78). */
const SOFT = 'var(--chart-3)'

function format(kind: VitalSeries['kind'], value: number, value2?: number) {
  if (kind === 'blood_pressure') return `${value}/${value2 ?? '–'}`
  if (kind === 'oxygen') return `${value}%`
  if (kind === 'temperature') return `${value.toFixed(1)}°`
  return String(value)
}

/** Times may come as ISO timestamps or already as "14:50". */
const timeLabel = (time: string) => (time.includes('T') ? clock(time) : time)

/** One vitals chart for the patient dialog: normal band, line, last dot, times. */
export function VitalsChart({ series }: { series: VitalSeries }) {
  const { kind, points, normal } = series
  const bp = kind === 'blood_pressure'
  const last = points.at(-1)
  const out = !!last && (last.value < normal.low || last.value > normal.high)
  const color = out ? ALERT : INK

  // Same scale as the canvas: values plus the normal range, 15% room above and below.
  const all = [
    ...points.map((p) => p.value),
    ...(bp ? points.flatMap((p) => (p.value2 === undefined ? [] : [p.value2])) : []),
    normal.low,
    normal.high,
  ]
  const pad = (Math.max(...all) - Math.min(...all)) * 0.15 || 1
  const domain = [Math.min(...all) - pad, Math.max(...all) + pad]
  const n = Math.max(points.length, 1)
  const data = points.map((p, i) => ({
    i,
    time: timeLabel(p.time),
    value: p.value,
    value2: p.value2,
  }))
  // Keep time labels readable when there are many readings; the latest always shows.
  const step = Math.ceil(n / 6)

  const config = {
    value: { label: bp ? 'Systolic' : series.label, color },
    value2: { label: 'Diastolic', color: SOFT },
  } satisfies ChartConfig

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-subtle px-4 pt-3.5 pb-3">
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] text-ink-soft">{series.label}</span>
        <b className={cn('text-[22px] tabular-nums', out ? 'text-alert' : 'text-foreground')}>
          {last ? format(kind, last.value, last.value2) : '–'}
        </b>
      </span>
      <ChartContainer config={config} className="aspect-auto h-[72px] w-full">
        <LineChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="i" type="number" domain={[-0.5, n - 0.5]} hide />
          <YAxis type="number" domain={domain} hide />
          <ReferenceArea
            y1={normal.low}
            y2={normal.high}
            fill="var(--chart-band)"
            fillOpacity={1}
            radius={3}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_, payload) => payload?.[0]?.payload?.time}
              />
            }
          />
          <Line
            dataKey="value"
            type="bumpX"
            stroke="var(--color-value)"
            strokeWidth={2}
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          {bp && (
            <Line
              dataKey="value2"
              type="bumpX"
              stroke="var(--color-value2)"
              strokeWidth={1.75}
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          )}
          {last && (
            <ReferenceDot x={points.length - 1} y={last.value} r={3.5} fill={color} stroke="none" />
          )}
        </LineChart>
      </ChartContainer>
      <div
        className="grid text-center text-[11px] text-faint tabular-nums"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {data.map((d) => (
          <span key={d.i}>{(n - 1 - d.i) % step === 0 ? d.time : ''}</span>
        ))}
      </div>
      <span className="text-muted-foreground text-xs">
        {/^normal/i.test(normal.text) ? normal.text : `Normal ${normal.text}`}
      </span>
    </div>
  )
}
