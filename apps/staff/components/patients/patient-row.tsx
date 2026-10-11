import type { PatientRow } from '@bell/core/staff-api'
import { cn } from 'cn'
import { ChevronRight } from 'lucide-react'
import type { MouseEvent } from 'react'
import { StatusLine } from '@/components/bell/status-line'
import { UrgencyTag } from '@/components/bell/urgency-tag'
import { VitalsSparkline } from '@/components/bell/vitals-sparkline'
import { WatchTag } from '@/components/bell/watch-tag'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { ago } from '@/lib/time'

// Stop a button click from also opening the dialog through the row.
const only = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation()
  fn()
}

/** One patient. The whole row opens the patient dialog. */
export function PatientTableRow({
  row,
  floor,
  taking,
  onOpen,
  onTake,
}: {
  row: PatientRow
  floor: boolean
  taking: boolean
  onOpen: () => void
  onTake: () => void
}) {
  const urgent = row.ask?.tier === 'urgent'
  return (
    <TableRow
      onClick={onOpen}
      className={cn(
        'h-[104px] cursor-pointer',
        urgent && 'bg-urgent/5',
        floor && !row.mine && 'opacity-[0.72]',
      )}
    >
      <TableCell>
        <div className="flex min-w-0 flex-col gap-1">
          <button
            type="button"
            onClick={only(onOpen)}
            className="max-w-full self-start truncate text-left font-bold text-base"
          >
            {row.name}
          </button>
          <span className="truncate text-[13px] text-ink-soft">{row.line}</span>
          <span className="flex min-h-[22px] items-center gap-2">
            {row.watch ? <WatchTag more={row.watchMore}>{row.watch}</WatchTag> : null}
            {floor && !row.mine && row.nurseName ? (
              <span className="font-semibold text-ink-soft text-xs">{row.nurseName}</span>
            ) : null}
            {floor && row.canTake ? (
              <Button size="xs" disabled={taking} onClick={only(onTake)}>
                Take patient
              </Button>
            ) : null}
          </span>
        </div>
      </TableCell>

      <TableCell>
        {row.ask ? (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2">
              <UrgencyTag tier={row.ask.tier} />
              <span className="text-[13px] text-ink-soft">{ago(row.ask.askedAt)}</span>
            </span>
            <span className="font-semibold text-[15px] leading-[1.35]">“{row.ask.words}”</span>
          </div>
        ) : (
          <span className="text-faint text-sm">Nothing for you</span>
        )}
      </TableCell>

      <TableCell className="text-sm">
        <OtherTeams row={row} />
      </TableCell>

      <TableCell className="p-3">
        <div className="grid min-w-0 grid-cols-3 gap-3">
          <VitalsSparkline label="HR" values={row.vitals.heartRate} low={60} high={100} />
          <VitalsSparkline label="BP" values={row.vitals.systolic} low={90} high={140} />
          <VitalsSparkline label="O2" values={row.vitals.oxygen} low={92} high={100} unit="%" />
        </div>
      </TableCell>

      <TableCell className="p-0 text-center">
        <Button
          variant="outline"
          size="icon"
          onClick={only(onOpen)}
          aria-label={`Open details for ${row.name}`}
          className="border-border text-ink-strong"
        >
          <ChevronRight strokeWidth={2.25} />
        </Button>
      </TableCell>
    </TableRow>
  )
}

/** Work with other teams: the most relevant request, or "All done" when only finished ones are left. */
function OtherTeams({ row }: { row: PatientRow }) {
  if (row.sent) {
    const more = row.sent.more + row.doneToday
    return (
      <div className="flex min-w-0 flex-col gap-[3px]">
        <span className="font-semibold leading-[1.35]">{row.sent.what}</span>
        <StatusLine text={row.sent.status} stuck={row.sent.stuck} />
        {more > 0 ? <span className="text-muted-foreground text-xs">+{more} more</span> : null}
      </div>
    )
  }
  if (row.doneToday > 0) {
    return (
      <div className="flex min-w-0 flex-col gap-[3px]">
        <span className="font-semibold leading-[1.35]">All done</span>
        <StatusLine text={`${row.doneToday} today`} />
      </div>
    )
  }
  return <span className="text-faint">Nothing open</span>
}
