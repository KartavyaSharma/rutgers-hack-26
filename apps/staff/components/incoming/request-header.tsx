import type { IncomingItem } from '@bell/core/staff-api'
import { UrgencyTag } from '@/components/bell/urgency-tag'
import { WatchTag } from '@/components/bell/watch-tag'

/** Name, room with one watch tag, and the urgency tag on the right. */
export function RequestHeader({ item }: { item: IncomingItem }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h1 className="text-2xl font-bold">{item.patientName}</h1>
        <span className="flex items-center gap-2.5 text-sm text-ink-soft">
          {item.roomLabel}
          {item.watch ? <WatchTag>{item.watch}</WatchTag> : null}
        </span>
      </div>
      <UrgencyTag tier={item.tier} size="lg" />
    </div>
  )
}
