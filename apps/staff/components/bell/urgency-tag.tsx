import type { Tier } from '@bell/core/staff-api'
import { cn } from 'cn'

const label: Record<Exclude<Tier, 'routine'>, string> = {
  urgent: 'URGENT',
  high: 'HIGH',
  scheduled: 'SCHEDULED',
}

const tone: Record<Exclude<Tier, 'routine'>, string> = {
  urgent: 'border-urgent bg-urgent text-urgent-foreground',
  high: 'border-high-border bg-high text-high-foreground',
  scheduled: 'border-[#B8AFA4] bg-card text-ink-soft',
}

/**
 * One urgency tag, top right of a card or row. Routine shows nothing.
 * `size="lg"` is the detail header tag. `inverted` is for a tag sitting on a red (urgent) card.
 */
export function UrgencyTag({
  tier,
  size = 'sm',
  inverted = false,
  className,
}: {
  tier: Tier
  size?: 'sm' | 'lg'
  inverted?: boolean
  className?: string
}) {
  if (tier === 'routine') return null
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center border font-bold tracking-[0.06em] whitespace-nowrap',
        size === 'lg'
          ? 'h-[26px] rounded-md px-2.5 text-xs'
          : 'h-5 rounded-[5px] px-[7px] text-[10px]',
        inverted && tier === 'urgent' ? 'border-card bg-card text-alert' : tone[tier],
        className,
      )}
    >
      {label[tier]}
    </span>
  )
}
