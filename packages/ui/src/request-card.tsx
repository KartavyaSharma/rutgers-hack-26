import type { ComponentProps } from 'react'
import { cn, focusRing, pressable } from './cn'
import { Icon, type IconName } from './icon'
import { STEP_LABELS, type StepStatus } from './step-track'

export interface RequestCardProps extends Omit<ComponentProps<'button'>, 'children' | 'onClick'> {
  /** What the patient asked for, never a team name, e.g. "An extra blanket". */
  label: string
  icon?: IconName
  status: StepStatus
  /** Override the step word (e.g. translated). */
  statusLabel?: string
  onPress: () => void
}

/** One open request on the home screen: icon, label, step word, and a pencil that opens My requests. */
export function RequestCard({
  label,
  icon = 'mic',
  status,
  statusLabel,
  onPress,
  className,
  type = 'button',
  ...props
}: RequestCardProps) {
  return (
    <button
      type={type}
      onClick={() => onPress()}
      className={cn(
        'flex min-h-tap-xl w-full items-center gap-3.5 rounded-md bg-surface py-3 pr-5 pl-4 text-left text-ink',
        pressable,
        focusRing,
        className,
      )}
      {...props}
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-pill bg-action-tint text-action-ink">
        <Icon name={icon} className="size-7" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-title leading-tight font-bold">{label}</span>
        <span className="text-body font-bold text-action-ink">
          {statusLabel ?? STEP_LABELS[status]}
        </span>
      </span>
      <span className="flex shrink-0 text-action-ink">
        <Icon name="pencil" className="size-7" strokeWidth={2.2} />
        <span className="sr-only">See details</span>
      </span>
    </button>
  )
}
