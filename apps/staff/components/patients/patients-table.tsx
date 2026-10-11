import type { PatientRow } from '@bell/core/staff-api'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PatientTableRow } from './patient-row'

// Header line as an inset shadow so it stays put while the sticky header scrolls.
const head = 'bg-card shadow-[inset_0_-1px_0_var(--border)]'

/** PATIENT · NEEDS YOU · OTHER TEAMS · VITALS TODAY. Everything else opens in the patient dialog. */
export function PatientsTable({
  label,
  rows,
  floor,
  takingId,
  onOpen,
  onTake,
}: {
  label: string
  rows: PatientRow[]
  floor: boolean
  takingId: string | null
  onOpen: (patientId: string) => void
  onTake: (row: PatientRow) => void
}) {
  return (
    <Table aria-label={label} className="min-w-[1120px] table-fixed">
      <colgroup>
        <col className="w-[290px]" />
        <col />
        <col className="w-[260px]" />
        <col className="w-[316px]" />
        <col className="w-16" />
      </colgroup>
      <TableHeader className="sticky top-0 z-10 [&_tr]:border-b-0">
        <TableRow>
          <TableHead className={head}>Patient</TableHead>
          <TableHead className={head}>Needs you</TableHead>
          <TableHead className={head}>Other teams</TableHead>
          <TableHead className={head}>Vitals today</TableHead>
          <TableHead className={head}>
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <PatientTableRow
            key={row.patientId}
            row={row}
            floor={floor}
            taking={takingId === row.patientId}
            onOpen={() => onOpen(row.patientId)}
            onTake={() => onTake(row)}
          />
        ))}
      </TableBody>
    </Table>
  )
}
