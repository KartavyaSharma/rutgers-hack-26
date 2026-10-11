import { cn, focusRing, pressable } from './cn'
import { Icon, type IconName } from './icon'

export interface CategoryButtonProps {
  label: string
  /** Three examples under the label, e.g. "Water, ice, meals". */
  examples: string
  icon: IconName
  onPress: () => void
  className?: string
}

/** One of the eight category buttons on the home screen with voice only off. */
export function CategoryButton({ label, examples, icon, onPress, className }: CategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onPress()}
      className={cn(
        'flex min-h-0 items-center gap-3.5 rounded-sm bg-surface px-4 text-left text-ink',
        pressable,
        focusRing,
        className,
      )}
    >
      <span className="flex size-disc shrink-0 items-center justify-center rounded-chip bg-action-tint text-action-ink">
        <Icon name={icon} className="size-8" />
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-[22px] leading-tight font-bold">{label}</span>
        <span className="text-[17px] leading-tight text-muted">{examples}</span>
      </span>
    </button>
  )
}
