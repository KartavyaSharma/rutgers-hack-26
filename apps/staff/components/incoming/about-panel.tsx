'use client'

import { Maximize2, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useState } from 'react'
import { BellNotes } from '@/components/bell/bell-notes'
import { FactList } from '@/components/bell/fact-list'
import { RequestRow } from '@/components/bell/request-row'
import { SectionLabel } from '@/components/bell/section-label'
import { PatientDialog } from '@/components/patient-dialog/patient-dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useApi } from '@/lib/use-api'

/** Right panel: Bell's notes, three key facts, this patient's other requests, "All details". */
export function AboutPanel({
  patientId,
  first,
  excludeId,
  refreshKey,
}: {
  patientId: string
  first: string
  /** The request on screen, left out of "Also for". */
  excludeId: string
  /** Changes when the request list changes, so statuses stay fresh. */
  refreshKey: string
}) {
  const [full, setFull] = useState(false)
  // Collapsed stays collapsed while the nurse moves between requests.
  const [collapsed, setCollapsed] = useState(false)
  const patient = useApi(`patient:${patientId}:${refreshKey}`, () => api.patient(patientId), {
    refreshMs: 10000,
  })
  // Keep the last patient's data off screen while the new one loads.
  const detail = patient.data?.chart.patient.id === patientId ? patient.data : undefined
  const others = detail?.requests.filter((r) => r.id !== excludeId) ?? []

  if (collapsed) {
    return (
      <aside
        aria-label={`About ${first}`}
        className="flex w-12 shrink-0 flex-col items-center border-l border-[#EEE9E2] bg-[#FAF8F5] pt-[18px]"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Show About ${first}`}
          title={`Show About ${first}`}
          onClick={() => setCollapsed(false)}
        >
          <PanelRightOpen />
        </Button>
      </aside>
    )
  }

  return (
    <aside
      aria-label={`About ${first}`}
      className="flex w-[340px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-[#EEE9E2] bg-[#FAF8F5] px-[22px] pt-[22px] pb-[18px]"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <b className="text-base">About {first}</b>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setFull(true)}>
              <Maximize2 />
              All details
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Hide About ${first}`}
              title={`Hide About ${first}`}
              onClick={() => setCollapsed(true)}
            >
              <PanelRightClose />
            </Button>
          </div>
        </div>
        {detail ? (
          <BellNotes label="" size="sm">
            {detail.notes}
          </BellNotes>
        ) : (
          <p className="text-sm text-ink-soft">
            {patient.error ? `Could not load ${first}’s details. Trying again.` : 'Loading…'}
          </p>
        )}
      </div>

      {detail ? <FactList facts={detail.chart.facts.slice(0, 3)} labelWidth={76} /> : null}

      {others.length ? (
        <section className="flex flex-col">
          <SectionLabel className="mb-1">Also for {first}</SectionLabel>
          {others.map((r) => (
            <RequestRow key={r.id} request={r} variant="stacked" />
          ))}
        </section>
      ) : null}

      <PatientDialog patientId={patientId} open={full} onOpenChange={setFull} />
    </aside>
  )
}
