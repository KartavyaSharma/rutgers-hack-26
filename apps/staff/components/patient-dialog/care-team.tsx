'use client'

import type { PatientChart, StaffMember } from '@bell/core/hospital'
import type { ReactNode } from 'react'
import { PersonAvatar } from '@/components/bell/person-avatar'
import { SectionLabel } from '@/components/bell/section-label'
import { useStaff } from '@/components/shell/staff-context'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const roleText = (m: StaffMember) =>
  m.role === 'doctor'
    ? m.specialty
      ? `Doctor · ${m.specialty}`
      : 'Doctor'
    : m.role === 'charge_nurse'
      ? 'Charge nurse'
      : 'Nurse'

/** Only the doctor and the assigned nurse. Aides, PCTs and transport are never listed here. */
export function CareTeam({ chart }: { chart: PatientChart }) {
  const { staff } = useStaff()
  const team = chart.careTeam
  const doctor = team.find((m) => m.role === 'doctor')
  const nurse =
    team.find((m) => m.id === chart.patient.nurseId) ??
    team.find((m) => m.role === 'nurse' || m.role === 'charge_nurse')

  return (
    <section className="flex flex-col gap-2.5">
      <SectionLabel>Care team</SectionLabel>
      {doctor ? <Member person={doctor} you={doctor.id === staff.id} /> : null}
      {nurse ? (
        <Member person={nurse} you={nurse.id === staff.id} />
      ) : (
        <Row
          avatar={
            <Avatar>
              <AvatarFallback>–</AvatarFallback>
            </Avatar>
          }
          name="No nurse yet"
          job="Nurse"
        />
      )}
    </section>
  )
}

function Member({ person, you }: { person: StaffMember; you: boolean }) {
  return (
    <Row
      avatar={<PersonAvatar person={person} />}
      name={you ? `${person.name} (you)` : person.name}
      job={roleText(person)}
      contact={person.contact}
    />
  )
}

function Row({
  avatar,
  name,
  job,
  contact,
}: {
  avatar: ReactNode
  name: string
  job: string
  contact?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="text-sm">{name}</b>
        <span className="text-[13px] text-ink-soft">{job}</span>
      </span>
      {contact ? (
        <span className="whitespace-nowrap text-[13px] text-ink-soft">{contact}</span>
      ) : null}
    </div>
  )
}
