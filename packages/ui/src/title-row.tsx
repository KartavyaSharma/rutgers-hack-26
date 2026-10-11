import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'

export interface TitleRowProps {
  title: string
  /** Shows the round back button. */
  onBack?: () => void
  className?: string
}

/** Screen title, with a back button on category screens. */
export function TitleRow({ title, onBack, className }: TitleRowProps) {
  return (
    <div className={cn('flex min-h-tap items-center gap-3', className)}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={cn(
            'flex size-tap shrink-0 items-center justify-center rounded-pill border-2 border-border bg-surface text-ink',
            pressable,
            focusRing,
          )}
        >
          <Icon name="chevron" className="size-[26px] rotate-180" />
        </button>
      ) : null}
      <h2 className="font-heading text-[30px] leading-none">{title}</h2>
    </div>
  )
}
