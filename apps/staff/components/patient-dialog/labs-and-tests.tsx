import type { LabResult, PatientChart } from '@bell/core/hospital'
import { cn } from 'cn'
import { SectionLabel } from '@/components/bell/section-label'
import { EmptyLine, ListRow } from './section-parts'

/** Lab values (flagged ones red with "high" / "low"), then tests and imaging. */
export function LabsAndTests({ labs, tests }: { labs: LabResult[]; tests: PatientChart['tests'] }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Labs and tests</SectionLabel>
      {labs.length || tests.length ? (
        <div className="flex flex-col">
          {labs.map((l) => (
            <ListRow
              key={l.name}
              title={l.name}
              sub={l.normal ? `Normal ${l.normal} · ${l.time}` : l.time}
              end={
                <b className={cn('text-right font-semibold', l.flag && 'text-alert')}>
                  {l.value}
                  {l.flag ? ` ${l.flag}` : ''}
                </b>
              }
            />
          ))}
          {tests.map((t) => (
            <ListRow
              key={t.name}
              title={t.name}
              sub={t.when}
              end={<b className="text-right font-semibold">{t.result}</b>}
            />
          ))}
        </div>
      ) : (
        <EmptyLine>No labs or tests yet.</EmptyLine>
      )}
    </section>
  )
}
