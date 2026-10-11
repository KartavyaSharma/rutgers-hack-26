import type { Person, Plan } from '@bell/core/staff-api'
import type { ReactNode } from 'react'
import { PersonChip } from '@/components/bell/person-chip'
import { SectionLabel } from '@/components/bell/section-label'

/** "BELL SUGGESTS": goal, then Send / Tell / Watch / Chart rows, then Why. */
export function PlanSection({
  plan,
  first,
  send,
  youId,
  onRemove,
}: {
  plan: Plan
  /** Patient's first name, for "Tell Jorge". */
  first: string
  /** The people still on the plan (the nurse may have removed some). */
  send: Person[]
  youId: string
  /** Set while the plan can still change (before approving). */
  onRemove?: (personId: string) => void
}) {
  return (
    <section className="mt-[26px] flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <SectionLabel>Bell suggests</SectionLabel>
        <p className="text-[17px] leading-[1.4] font-semibold">{plan.goal}</p>
      </div>

      <div className="grid grid-cols-[100px_minmax(0,1fr)] items-start gap-x-4 gap-y-[18px] text-sm">
        <span className="pt-1.5 text-ink-soft">Send</span>
        <div className="flex min-w-0 flex-col gap-2">
          {send.length ? (
            <div className="flex flex-wrap gap-2">
              {send.map((p) => (
                <PersonChip
                  key={p.id}
                  person={p.id === youId ? { ...p, name: 'You' } : p}
                  onRemove={onRemove ? () => onRemove(p.id) : undefined}
                />
              ))}
            </div>
          ) : (
            <span className="pt-1.5 font-semibold">{plan.sendLine ?? 'No one yet.'}</span>
          )}
          {plan.sendNote ? <span className="text-ink-soft">{plan.sendNote}</span> : null}
        </div>

        {plan.tell ? (
          <Row label={`Tell ${first}`}>
            <span className="max-w-[460px] rounded-[10px] bg-background px-3.5 py-2.5 text-[15px] leading-[1.4]">
              “{plan.tell.text}”
            </span>
            <span className="text-[13px] text-muted-foreground">{plan.tell.channel}</span>
          </Row>
        ) : null}
        {plan.watch ? <Row label="Watch">{plan.watch}</Row> : null}
        {plan.chart ? <Row label="Chart">{plan.chart}</Row> : null}
      </div>

      <p className="mt-1 border-t border-subtle pt-3.5 text-[13px] leading-[1.45] text-ink-soft">
        <b className="text-foreground">Why</b> · {plan.why}
      </p>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="text-ink-soft">{label}</span>
      <div className="flex min-w-0 flex-col gap-1.5">{children}</div>
    </>
  )
}
