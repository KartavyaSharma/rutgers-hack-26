import type { VitalSeries } from '@bell/core/hospital'
import { SectionLabel } from '@/components/bell/section-label'
import { VitalsChart } from '@/components/bell/vitals-chart'
import { EmptyLine } from './section-parts'

/** Heart rate, blood pressure, oxygen and temperature for today, side by side. */
export function VitalsToday({ vitals }: { vitals: VitalSeries[] }) {
  const charted = vitals.filter((s) => s.points.length > 0)
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <SectionLabel>Vitals today</SectionLabel>
        <span className="text-muted-foreground text-xs">Shaded band is the normal range</span>
      </div>
      {charted.length ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {charted.map((s) => (
            <VitalsChart key={s.kind} series={s} />
          ))}
        </div>
      ) : (
        <EmptyLine>No vitals taken yet today.</EmptyLine>
      )}
    </section>
  )
}
