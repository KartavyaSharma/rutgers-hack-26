import type { ClinicalNote } from '@bell/core/hospital'
import { SectionLabel } from '@/components/bell/section-label'
import { EmptyLine } from './section-parts'

/** Notes from the doctor, consults and therapy, newest as Epic gives them. */
export function TeamNotes({ notes }: { notes: ClinicalNote[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Doctor and team notes</SectionLabel>
      {notes.length ? (
        notes.map((n) => (
          <article
            key={`${n.author} ${n.when}`}
            className="flex flex-col gap-1 border-subtle border-b pb-3"
          >
            <span className="text-[13px] text-ink-soft">
              <b className="text-foreground text-sm">{n.author}</b> · {n.when}
            </span>
            <p className="m-0 text-sm leading-normal">{n.text}</p>
          </article>
        ))
      ) : (
        <EmptyLine>No notes yet.</EmptyLine>
      )}
    </section>
  )
}
