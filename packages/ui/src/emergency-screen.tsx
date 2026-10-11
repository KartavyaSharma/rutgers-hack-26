'use client'

import { useEffect, useId, useRef } from 'react'
import { Button } from './button'
import { cn, focusRing } from './cn'
import { Icon } from './icon'
import { useT } from './text'

/** listening/connecting: a voice session is open; idle: voice available but not running; off: no voice. */
export type EmergencyVoiceState = 'listening' | 'connecting' | 'idle' | 'off'

export interface EmergencyScreenProps {
  voice: EmergencyVoiceState
  /** Restart talking (only shown when voice is idle). */
  onTalk?: () => void
  /** "I pressed this by mistake". */
  onMistake: () => void
  /** True while the mistake is being cancelled. */
  cancelling?: boolean
  /** "Resolved by staff": the nurse closes the call at the bedside. */
  onResolved?: () => void
  /** True while the call is being closed. */
  resolving?: boolean
  /** Move focus to the screen when it appears (default). Off for previews. */
  autoFocus?: boolean
  className?: string
}

const VOICE_WORDS: Record<EmergencyVoiceState, string> = {
  listening: "I'm listening",
  connecting: 'Getting ready…',
  idle: 'Tap to talk',
  off: '',
}

/**
 * Full screen after "I need help immediately". No back button: it stays until staff close it
 * ("Resolved by staff", or the request is done on their side), or with "I pressed this by
 * mistake". Rendered in place (not a portal) by the room page.
 */
export function EmergencyScreen({
  voice,
  onTalk,
  onMistake,
  cancelling = false,
  onResolved,
  resolving = false,
  autoFocus = true,
  className,
}: EmergencyScreenProps) {
  const t = useT()
  const id = useId()
  const ref = useRef<HTMLElement>(null)
  // Take focus when it appears, so assistive tech lands on the alert.
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  const talking = voice === 'listening' || voice === 'connecting'
  const disc = (
    <span className="relative flex size-disc-listen items-center justify-center">
      {talking ? (
        <>
          <span className="absolute inset-0 rounded-pill bg-on-nurse-line motion-safe:animate-ripple" />
          <span className="absolute inset-0 rounded-pill bg-on-nurse-line motion-safe:animate-ripple [animation-delay:1s]" />
        </>
      ) : null}
      <span className="relative flex size-disc-listen items-center justify-center rounded-pill bg-on-nurse text-nurse">
        <Icon name={voice === 'off' ? 'alert' : 'mic'} className="size-[71px]" />
      </span>
    </span>
  )

  return (
    <section
      ref={ref}
      tabIndex={-1}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      className={cn(
        'absolute inset-0 z-30 flex flex-col items-center bg-nurse px-14 py-11 text-center text-on-nurse outline-none',
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
        {voice === 'idle' && onTalk ? (
          <button
            type="button"
            onClick={onTalk}
            aria-label={t('Tap to talk')}
            className={cn('rounded-pill', focusRing)}
          >
            {disc}
          </button>
        ) : (
          disc
        )}
        {voice !== 'off' ? (
          <p className="text-lead font-bold" aria-live="polite">
            {t(VOICE_WORDS[voice])}
          </p>
        ) : null}
        <h2 id={`${id}-title`} className="mt-4 font-heading text-hero leading-none">
          {t('Help is on the way')}
        </h2>
        <p id={`${id}-body`} className="text-title leading-body text-on-nurse-muted">
          {t('Your nurse has been alerted.')}
          {voice !== 'off' ? (
            <>
              <br />
              {t("Tell us what's wrong, if you can.")}
            </>
          ) : null}
        </p>
      </div>
      <div className="flex w-full gap-3.5">
        <Button
          variant="secondary"
          size="xl"
          onClick={onMistake}
          disabled={cancelling || resolving}
          className="flex-1 border-on-nurse-line text-lead text-on-nurse active:bg-on-nurse-disc"
        >
          {cancelling ? t('Cancelling…') : t('I pressed this by mistake')}
        </Button>
        {onResolved ? (
          <Button
            variant="secondary"
            size="xl"
            onClick={onResolved}
            disabled={cancelling || resolving}
            className="flex-1 border-on-nurse-line text-lead text-on-nurse active:bg-on-nurse-disc"
          >
            {resolving ? t('Closing…') : t('Resolved by staff')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
