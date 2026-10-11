import type { IncomingItem } from '@bell/core/staff-api'
import { cn } from 'cn'
import { UrgencyTag } from '@/components/bell/urgency-tag'
import { ago } from '@/lib/time'

/** One request in the left rail: name, room, time; the words; Bell's summary with the urgency tag. Urgent requests that still need an OK are filled red. */
export function RequestCard({
  item,
  selected,
  onSelect,
}: {
  item: IncomingItem
  selected: boolean
  onSelect: () => void
}) {
  const urgent = item.tier === 'urgent' && item.state === 'needs_ok'
  const sub = urgent ? 'text-[#F8DCD2]' : 'text-ink-soft'
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full shrink-0 cursor-pointer flex-col gap-[3px] rounded-[10px] border-2 px-3.5 py-2.5 text-left',
        urgent ? 'bg-urgent text-urgent-foreground' : 'bg-card text-foreground',
        selected ? (urgent ? 'border-[#6E2414]' : 'border-foreground') : 'border-transparent',
      )}
    >
      <span className="flex min-w-0 items-baseline gap-2 text-sm whitespace-nowrap">
        <b className="shrink-0">{item.patientName}</b>
        <span className={cn('min-w-0 truncate text-[13px]', sub)}>{item.roomLabel}</span>
        <span className={cn('ml-auto shrink-0 text-[13px]', sub)}>{ago(item.askedAt)}</span>
      </span>
      <span className="text-sm leading-[1.35] font-semibold">“{item.words}”</span>
      <span className={cn('flex items-center gap-2 text-xs', sub)}>
        <span className="min-w-0 flex-1 truncate">{item.summary}</span>
        <UrgencyTag tier={item.tier} inverted={urgent} className="shrink-0" />
      </span>
    </button>
  )
}
