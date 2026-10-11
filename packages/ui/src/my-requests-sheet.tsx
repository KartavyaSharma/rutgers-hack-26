'use client'

import { Button } from './button'
import { cn } from './cn'
import { Icon, type IconName } from './icon'
import { Sheet } from './overlay'
import { STEP_LABELS, type StepStatus, StepTrack, stepLabels } from './step-track'
import { useT } from './text'

export interface MyRequestItem {
  id: string
  /** What the patient asked for, never a team name. */
  label: string
  icon?: IconName
  status: StepStatus
  /** Plain-words status line, e.g. "Someone is on the way". */
  line: string
  /** e.g. "12 min ago" */
  when: string
  /** The patient already tapped "Still waiting?". */
  nudged?: boolean
}

export interface MyRequestsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  openItems: readonly MyRequestItem[]
  earlierItems: readonly MyRequestItem[]
  /** "Still waiting?": remind the team. */
  onNudge: (id: string) => void
  onCancel: (id: string) => void
  /** Request with an action in flight; its buttons are disabled. */
  busyId?: string | null
  container?: HTMLElement | null
}

const sectionLabel = 'text-body font-bold uppercase tracking-[0.06em] text-muted'

/** Open requests with their steps and actions, then the ones finished earlier today. */
export function MyRequestsSheet({
  open,
  onOpenChange,
  openItems,
  earlierItems,
  onNudge,
  onCancel,
  busyId = null,
  container,
}: MyRequestsSheetProps) {
  const t = useT()
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('My requests')} fill container={container}>
      <div className="flex flex-col gap-3">
        <h3 className={cn(sectionLabel, 'font-body')}>Open now</h3>
        {openItems.length === 0 ? (
          <p className="text-lead text-muted">Nothing open right now.</p>
        ) : null}
        {openItems.map((item) => {
          const busy = busyId === item.id
          return (
            <article
              key={item.id}
              aria-label={item.label}
              className="flex shrink-0 flex-col gap-3 rounded-lg bg-surface px-6 py-5"
            >
              <div className="flex items-center gap-4">
                {item.icon ? (
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-pill bg-action-tint text-action-ink">
                    <Icon name={item.icon} className="size-7" />
                  </span>
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-label leading-tight font-bold">{item.label}</span>
                  <span className="text-body text-muted">
                    {item.line} · {item.when}
                  </span>
                </div>
              </div>
              <StepTrack status={item.status} labels={stepLabels(t)} />
              <div className="flex items-center justify-end gap-3">
                {item.nudged ? (
                  <span className="px-2 text-body font-bold text-muted">{t('Reminder sent')}</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => onNudge(item.id)}
                    disabled={busy}
                  >
                    {t('Still waiting?')}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => onCancel(item.id)}
                  disabled={busy}
                >
                  {t('Cancel')}
                </Button>
              </div>
            </article>
          )
        })}

        <h3 className={cn(sectionLabel, 'mt-2 font-body')}>{t('Earlier')}</h3>
        {earlierItems.length === 0 ? (
          <p className="text-lead text-muted">{t('Nothing earlier today.')}</p>
        ) : null}
        {earlierItems.map((item) => (
          <div
            key={item.id}
            className="flex shrink-0 items-center gap-3.5 rounded-md border-2 border-border px-6 py-3.5"
          >
            <span className="flex-1 text-lead font-bold">{item.label}</span>
            <span className="text-body text-muted">{item.when}</span>
            <span
              className={cn(
                'text-body font-bold',
                item.status === 'done' ? 'text-action-ink' : 'text-muted',
              )}
            >
              {t(STEP_LABELS[item.status])}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
