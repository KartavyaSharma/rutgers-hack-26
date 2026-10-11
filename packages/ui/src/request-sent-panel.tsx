import { Button } from './button'
import { cn } from './cn'
import { Icon } from './icon'

export interface RequestSentPanelProps {
  /** What was sent, never a team name, e.g. "Water". */
  label: string
  onOkay: () => void
  /** "Cancel request": cancel what was just sent. */
  onCancel: () => void
  cancelling?: boolean
  className?: string
}

/** Voice only off: "Request sent" in place of the options (canvas "Full Menu - request sent"). */
export function RequestSentPanel({
  label,
  onOkay,
  onCancel,
  cancelling = false,
  className,
}: RequestSentPanelProps) {
  return (
    <section
      aria-label="Request sent"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-3.5 rounded-md bg-surface px-9 pt-9 pb-8 text-ink',
        className,
      )}
    >
      <span className="flex size-[72px] shrink-0 items-center justify-center rounded-pill bg-action text-on-action">
        <Icon name="check" className="size-10" strokeWidth={2.5} />
      </span>
      <p className="mt-1.5 text-lead font-bold text-action-ink">Request sent</p>
      <p className="font-heading text-[52px] leading-tight">{label}</p>
      <p className="text-lead leading-body">Someone is coming. You don’t need to ask again.</p>
      <p className="text-[19px] text-muted">
        Need to request more or make a change? Tap the mic or say “Hey Bell”.
      </p>
      <div className="mt-auto flex gap-3">
        <Button variant="primary" size="lg" onClick={onOkay} className="px-11">
          Okay
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={onCancel}
          disabled={cancelling}
          aria-busy={cancelling}
          className="px-[30px]"
        >
          {cancelling ? 'Cancelling…' : 'Cancel request'}
        </Button>
      </div>
    </section>
  )
}
