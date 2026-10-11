import { SectionLabel } from '@/components/bell/section-label'
import { EmptyLine } from './section-parts'

/** Conditions, home medicines, implants, living situation. */
export function History({ items }: { items: { label: string; value: string }[] }) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel>History</SectionLabel>
      {items.length ? (
        <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm leading-[1.4]">
          {items.map((h) => (
            <div key={h.label} className="contents">
              <dt className="text-ink-soft">{h.label}</dt>
              <dd className="m-0">{h.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <EmptyLine>Not recorded yet.</EmptyLine>
      )}
    </section>
  )
}
