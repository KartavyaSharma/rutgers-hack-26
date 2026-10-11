'use client'

import type { PatientSummary } from '@bell/core/hospital'
import type { PatientDetail } from '@bell/core/staff-api'
import { XIcon } from 'lucide-react'
import { BellNotes } from '@/components/bell/bell-notes'
import { EmptyState } from '@/components/bell/empty-state'
import { FactList } from '@/components/bell/fact-list'
import { SectionLabel } from '@/components/bell/section-label'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { useApi } from '@/lib/use-api'
import { CareTeam } from './care-team'
import { History } from './history'
import { LabsAndTests } from './labs-and-tests'
import { Medicines } from './medicines'
import { RequestsToday } from './requests-today'
import { TeamNotes } from './team-notes'
import { VitalsToday } from './vitals-today'

/** "Room 416, Bed A · 77 M". No diagnosis, no day count. */
const patientLine = ({ location, age, sex }: PatientSummary) =>
  `Room ${location.room}${location.bed ? `, Bed ${location.bed}` : ''} · ${age} ${sex}`

/** Loads one patient's chart and lays it out top to bottom in one scroll. */
export function PatientDetails({ patientId }: { patientId: string }) {
  const { data, error } = useApi(`patient:${patientId}`, () => api.patient(patientId), {
    refreshMs: 15000,
  })
  // Ignore a previous patient's data while the new one loads.
  const detail = data?.chart.patient.id === patientId ? data : undefined
  const patient = detail?.chart.patient

  return (
    <>
      <div className="flex shrink-0 items-center gap-4 border-[#EEE9E2] border-b px-7 pt-[22px] pb-[18px]">
        <div className="flex min-w-0 flex-1 items-baseline gap-3.5">
          <DialogTitle className="truncate font-bold text-2xl">
            {patient?.name ?? 'Patient details'}
          </DialogTitle>
          {patient ? (
            <span className="whitespace-nowrap text-[15px] text-ink-soft">
              {patientLine(patient)}
            </span>
          ) : null}
        </div>
        <DialogClose asChild>
          <Button variant="outline">
            <XIcon />
            Close
          </Button>
        </DialogClose>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-6 pb-8">
        {detail ? (
          <DetailsBody detail={detail} />
        ) : error ? (
          <EmptyState title="Could not load this patient" detail={error.message} />
        ) : (
          <EmptyState title="Loading" className="py-24" />
        )}
      </div>
    </>
  )
}

function DetailsBody({ detail }: { detail: PatientDetail }) {
  const { chart } = detail
  return (
    <div className="flex flex-col gap-8">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-w-0 flex-col gap-7">
          <BellNotes source="Written by Bell from Epic, the night handoff and today’s requests">
            {detail.notes}
          </BellNotes>
          <RequestsToday requests={detail.requests} />
        </div>
        <div className="flex min-w-0 flex-col gap-7">
          <section className="flex flex-col gap-2.5">
            <SectionLabel>Key facts</SectionLabel>
            <FactList facts={chart.facts} />
          </section>
          <CareTeam chart={chart} />
        </div>
      </div>

      <VitalsToday vitals={chart.vitals} />

      <div className="grid items-start gap-10 md:grid-cols-2">
        <Medicines medications={chart.medications} />
        <LabsAndTests labs={chart.labs} tests={chart.tests} />
      </div>

      <div className="grid items-start gap-10 md:grid-cols-2">
        <TeamNotes notes={chart.notes} />
        <History items={chart.history} />
      </div>
    </div>
  )
}
