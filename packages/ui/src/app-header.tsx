'use client'

import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'
import { useT } from './text'

const pill = cn(
  'inline-flex min-h-tap items-center gap-2.5 whitespace-nowrap rounded-pill border-2 border-border bg-surface py-2 pr-5 pl-4 font-body text-body font-bold text-ink',
  pressable,
  focusRing,
)

/** The Voice only switch drawn inside its pill. The whole pill is the tap target. */
function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative h-[30px] w-[52px] shrink-0 rounded-pill transition-colors duration-(--motion-duration)',
        on ? 'bg-action' : 'bg-border-strong/40',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] size-6 rounded-pill bg-surface transition-[left] duration-(--motion-duration)',
          on ? 'left-[25px]' : 'left-[3px]',
        )}
      />
    </span>
  )
}

export interface AppHeaderProps {
  /** "Hi, Maria" */
  title: string
  /** "Room 412 · Bed 3" */
  subtitle?: string
  /** Current language, e.g. "English". */
  languageLabel: string
  onLanguage: () => void
  voiceOnly: boolean
  onVoiceOnly: (on: boolean) => void
  /** Shown with voice only off: the My requests pill and its open count. */
  onMyRequests?: () => void
  requestCount?: number
  className?: string
}

/** Tablet header: greeting and room on the left; My requests, Voice only and Language pills. */
export function AppHeader({
  title,
  subtitle,
  languageLabel,
  onLanguage,
  voiceOnly,
  onVoiceOnly,
  onMyRequests,
  requestCount = 0,
  className,
}: AppHeaderProps) {
  const t = useT()
  return (
    <header className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-heading text-heading leading-none text-ink">{title}</h1>
        {subtitle ? <p className="text-body text-muted">{subtitle}</p> : null}
      </div>
      <div className="flex gap-2.5">
        {onMyRequests ? (
          <button type="button" onClick={onMyRequests} className={pill}>
            <Icon name="list" className="text-action-ink" />
            {t('My requests')}
            {requestCount > 0 ? (
              <span className="min-w-7 rounded-[14px] bg-action px-2.5 py-0.5 text-center text-caption text-on-action">
                {requestCount}
              </span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          role="switch"
          aria-checked={voiceOnly}
          onClick={() => onVoiceOnly(!voiceOnly)}
          className={cn(pill, 'gap-3 pr-3.5 pl-5')}
        >
          {t('Voice only')}
          <Toggle on={voiceOnly} />
        </button>
        <button
          type="button"
          onClick={onLanguage}
          aria-label={`Language: ${languageLabel}. Change language`}
          className={pill}
        >
          <Icon name="globe" className="text-action-ink" />
          {languageLabel}
        </button>
      </div>
    </header>
  )
}
