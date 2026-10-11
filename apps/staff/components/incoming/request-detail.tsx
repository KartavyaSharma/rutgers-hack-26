import type { IncomingItem, Person } from '@bell/core/staff-api'
import { QuoteBlock } from '@/components/bell/quote-block'
import { AboutPanel } from './about-panel'
import { ApproveBar } from './approve-bar'
import { askedMeta, firstName } from './format'
import { PlanSection } from './plan-section'
import { RequestHeader } from './request-header'

/** The selected request: what the patient asked, Bell's plan, the About panel, and the approve bar. */
export function RequestDetail({
  item,
  send,
  youId,
  busy,
  refreshKey,
  onRemove,
  onApprove,
  onReject,
}: {
  item: IncomingItem
  send: Person[]
  youId: string
  busy: boolean
  refreshKey: string
  onRemove: (personId: string) => void
  onApprove: () => void
  onReject: () => void
}) {
  const first = firstName(item.patientName)
  const open = item.state === 'needs_ok'
  return (
    <>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pt-6 pb-5">
          <RequestHeader item={item} />
          <div className="mt-[18px]">
            <QuoteBlock words={item.words} meta={askedMeta(item)} original={item.original} />
          </div>
          <PlanSection
            plan={item.plan}
            first={first}
            send={open ? send : item.plan.send}
            youId={youId}
            onRemove={open ? onRemove : undefined}
          />
        </div>
        <AboutPanel
          patientId={item.patientId}
          first={first}
          excludeId={item.id}
          refreshKey={refreshKey}
        />
      </div>
      <ApproveBar item={item} busy={busy} onApprove={onApprove} onReject={onReject} />
    </>
  )
}
