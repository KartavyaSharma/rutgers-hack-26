import type { IncomingItem } from '@bell/core/staff-api'
import { Button } from '@/components/ui/button'

/** Bottom of the selected request: Reject / Approve, or what happened once it is handled. */
export function ApproveBar({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: IncomingItem
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-t border-[#EEE9E2] px-6 pt-3.5 pb-4">
      {item.state === 'handled' ? (
        <span className="py-2.5 text-sm text-ink-strong">
          {item.handledNote ?? 'Bell handled this.'}
        </span>
      ) : (
        <>
          <Button
            variant="outline"
            size="lg"
            className="ml-auto"
            disabled={busy}
            onClick={onReject}
          >
            Reject
          </Button>
          <Button size="lg" disabled={busy} onClick={onApprove}>
            Approve
          </Button>
        </>
      )}
    </div>
  )
}
