import type { PatientRequest } from '@bell/core/staff-api'
import { RequestRow } from '@/components/bell/request-row'
import { SectionLabel } from '@/components/bell/section-label'
import { EmptyLine } from './section-parts'

/** Every request today in one list, whoever has it. */
export function RequestsToday({ requests }: { requests: PatientRequest[] }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Requests today</SectionLabel>
      {requests.length ? (
        <div className="flex flex-col">
          {requests.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </div>
      ) : (
        <EmptyLine>No requests yet today.</EmptyLine>
      )}
    </section>
  )
}
