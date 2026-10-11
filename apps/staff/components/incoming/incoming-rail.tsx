import type { IncomingItem } from '@bell/core/staff-api'
import { Segmented } from '@/components/bell/segmented'
import { RequestCard } from './request-card'

export type IncomingTab = 'need' | 'handled'

/** Left rail: "To approve / Bell handled" switch and the request cards. */
export function IncomingRail({
  tab,
  onTab,
  counts,
  items,
  selectedId,
  onSelect,
  message,
}: {
  tab: IncomingTab
  onTab: (tab: IncomingTab) => void
  counts?: { need: number; handled: number }
  items: IncomingItem[]
  selectedId?: string
  onSelect: (id: string) => void
  /** Calm status line: loading or could not reach Bell. */
  message?: string
}) {
  return (
    <aside
      aria-label="Requests"
      className="flex w-[360px] shrink-0 flex-col gap-3 rounded-[14px] bg-rail p-3"
    >
      <Segmented
        label="Which requests"
        variant="block"
        value={tab}
        onChange={onTab}
        options={[
          { value: 'need', label: 'To approve', count: counts?.need },
          { value: 'handled', label: 'Bell handled', count: counts?.handled },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {message ? <p className="px-2 py-1 text-[13px] text-ink-soft">{message}</p> : null}
        {items.map((item) => (
          <RequestCard
            key={item.id}
            item={item}
            selected={item.id === selectedId}
            onSelect={() => onSelect(item.id)}
          />
        ))}
        {counts && !items.length ? (
          <p className="px-2 py-6 text-center text-sm text-ink-soft">Nothing here right now.</p>
        ) : null}
      </div>
    </aside>
  )
}
