'use client'

import type { AskPlan } from '@bell/core/staff-api'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'

/**
 * Bell's plan for what the nurse typed: "BELL WILL DO THIS", the plan, Confirm / Change / Cancel.
 * Change calls onEdit when given, otherwise onCancel. Position it (e.g. above the Ask Bell bar) from outside.
 */
export function PlanConfirm({
  plan,
  onConfirm,
  onCancel,
  onEdit,
  busy = false,
  className,
}: {
  plan: AskPlan
  onConfirm: () => void
  onCancel: () => void
  onEdit?: () => void
  busy?: boolean
  className?: string
}) {
  return (
    <section
      aria-label="Bell’s plan"
      className={cn(
        'flex items-center gap-3.5 rounded-[14px] border border-border bg-card px-[18px] py-4 shadow-[0_12px_32px_rgba(42,38,34,0.16)]',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-xs font-bold tracking-[0.06em] text-ink-soft">BELL WILL DO THIS</span>
        <b className="text-base leading-snug">{plan.title}</b>
        {plan.detail ? <span className="text-[13px] text-ink-soft">{plan.detail}</span> : null}
      </div>
      <Button onClick={onConfirm} disabled={busy} className="h-[38px] px-[18px]">
        {busy ? 'Confirming…' : 'Confirm'}
      </Button>
      <Button
        variant="outline"
        onClick={onEdit ?? onCancel}
        disabled={busy}
        className="h-[38px] px-4 font-normal"
      >
        Change
      </Button>
      <Button variant="ghost" onClick={onCancel} disabled={busy} className="h-[38px] px-3">
        Cancel
      </Button>
    </section>
  )
}
