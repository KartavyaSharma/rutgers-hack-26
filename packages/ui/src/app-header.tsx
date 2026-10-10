import { cn, focusRing, pressable } from './cn'
import { Icon, type IconName } from './icon'

const pill = cn(
  'inline-flex min-h-tap items-center gap-2.5 rounded-pill border-2 border-border bg-surface py-2 pr-5 pl-4 font-body text-body font-bold text-ink',
  pressable,
  focusRing,
)

function HeaderButton({
  icon,
  label,
  ariaLabel,
  onPress,
}: {
  icon: IconName
  label: string
  ariaLabel?: string
  onPress: () => void
}) {
  return (
    <button type="button" onClick={onPress} aria-label={ariaLabel} className={pill}>
      <Icon name={icon} className="text-action-ink" />
      {label}
    </button>
  )
}

export interface AppHeaderProps {
  /** "Room 412" */
  title: string
  /** Line under the title, e.g. "Tap to request help". */
  subtitle?: string
  /** Current language, e.g. "English". */
  languageLabel: string
  onLanguage: () => void
  /** Short room status, e.g. "70° · Lights 60%". */
  roomStatus?: string
  onRoom: () => void
  className?: string
}

/** Tablet header: room name on the left, Language and Room buttons on the right. */
export function AppHeader({
  title,
  subtitle,
  languageLabel,
  onLanguage,
  roomStatus,
  onRoom,
  className,
}: AppHeaderProps) {
  return (
    <header className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-heading text-heading leading-none text-ink">{title}</h1>
        {subtitle ? <p className="text-body text-muted">{subtitle}</p> : null}
      </div>
      <div className="flex gap-2.5">
        <HeaderButton
          icon="globe"
          label={languageLabel}
          ariaLabel={`Language: ${languageLabel}. Change language`}
          onPress={onLanguage}
        />
        <HeaderButton
          icon="sliders"
          label={roomStatus ? `Room · ${roomStatus}` : 'Your room'}
          onPress={onRoom}
        />
      </div>
    </header>
  )
}
