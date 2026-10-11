'use client'

import type { PatientRow, Tier } from '@bell/core/staff-api'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/bell/empty-state'
import { Segmented } from '@/components/bell/segmented'
import { PatientDialog } from '@/components/patient-dialog/patient-dialog'
import { api } from '@/lib/api'
import { useApi } from '@/lib/use-api'
import { PatientsTable } from './patients-table'

type Scope = 'mine' | 'floor'

const scopes: { value: Scope; label: string }[] = [
  { value: 'mine', label: 'My patients' },
  { value: 'floor', label: 'Whole floor' },
]

const tierRank: Record<Tier, number> = { urgent: 0, high: 1, scheduled: 2, routine: 3 }

// Yours on top, then whoever needs the nurse most: urgent asks, then stuck work with other teams.
const rank = (r: PatientRow) =>
  (r.mine ? 0 : 10) + (r.ask ? tierRank[r.ask.tier] : r.sent?.stuck ? 2.5 : 9)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function PatientsScreen() {
  const [scope, setScope] = useState<Scope>('mine')
  const [openId, setOpenId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [takingId, setTakingId] = useState<string | null>(null)
  const { data, error, loading, refresh } = useApi(`patients:${scope}`, () => api.patients(scope), {
    refreshMs: 15000,
  })

  const rows = [...(data ?? [])].sort((a, b) => rank(a) - rank(b))
  const floor = scope === 'floor'
  const sub = floor
    ? `${plural(rows.length, 'patient')} · yours on top`
    : `${plural(rows.length, 'patient')} · ${rows.filter((r) => r.ask).length} need you`

  const open = (id: string) => {
    setOpenId(id)
    setDialogOpen(true)
  }

  const take = async (row: PatientRow) => {
    setTakingId(row.patientId)
    try {
      await api.takePatient(row.patientId)
      toast(`${row.name} is now your patient`)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not take this patient')
    } finally {
      setTakingId(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[68px] shrink-0 items-center gap-4 px-6">
        <h1 className="font-bold text-xl">{floor ? 'Whole floor' : 'My patients'}</h1>
        {data ? <span className="text-ink-soft text-sm">{sub}</span> : null}
        <Segmented
          className="ml-auto"
          label="Whose patients"
          value={scope}
          onChange={setScope}
          options={scopes}
        />
      </div>

      <div className="mx-6 mb-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border bg-card [&>[data-slot=table-container]]:min-h-0 [&>[data-slot=table-container]]:flex-1 [&>[data-slot=table-container]]:overflow-y-auto">
        {data && rows.length > 0 ? (
          <PatientsTable
            label={floor ? 'Whole floor' : 'My patients'}
            rows={rows}
            floor={floor}
            takingId={takingId}
            onOpen={open}
            onTake={take}
          />
        ) : error && !data ? (
          <EmptyState title="Could not load patients" detail={error.message} />
        ) : loading && !data ? (
          <EmptyState title="Loading patients" />
        ) : (
          <EmptyState
            title={floor ? 'No patients on the floor' : 'No patients yet'}
            detail={floor ? undefined : 'Take a patient from the whole floor view.'}
          />
        )}
      </div>

      <PatientDialog patientId={openId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
