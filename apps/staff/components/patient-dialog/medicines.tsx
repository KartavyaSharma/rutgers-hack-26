import type { Medication } from '@bell/core/hospital'
import { cn } from 'cn'
import { SectionLabel } from '@/components/bell/section-label'
import { EmptyLine, ListRow } from './section-parts'

/** Ordered medicines. A dose that is due is red: "Due 16:00". */
export function Medicines({ medications }: { medications: Medication[] }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Medicines</SectionLabel>
      {medications.length ? (
        <div className="flex flex-col">
          {medications.map((m) => (
            <ListRow
              key={m.name}
              className="grid-cols-[minmax(0,1fr)_120px]"
              title={m.name}
              sub={`${m.dose} · last ${m.lastGiven}`}
              end={
                <span
                  className={cn('text-right', m.due ? 'font-bold text-alert' : 'text-ink-soft')}
                >
                  {m.due ? `Due ${m.next}` : m.next}
                </span>
              }
            />
          ))}
        </div>
      ) : (
        <EmptyLine>No medicines ordered yet.</EmptyLine>
      )}
    </section>
  )
}
