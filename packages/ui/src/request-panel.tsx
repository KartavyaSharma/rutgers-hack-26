import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'

export type RequestPanelState = 'idle' | 'connecting' | 'listening' | 'unavailable'

const COPY: Record<RequestPanelState, { title: string; hint: string }> = {
  idle: { title: 'Make a request', hint: 'Tap here to talk' },
  connecting: { title: 'Make a request', hint: 'Getting ready…' },
  // Ends by itself when the patient stops talking (end of turn), so no "tap when done" here.
  listening: { title: "I'm listening", hint: 'Say what you need.' },
  unavailable: { title: 'Make a request', hint: "Voice isn't set up yet" },
}

export interface RequestPanelProps {
  state: RequestPanelState
  /** Tap to start talking; tap again while listening to finish. */
  onPress: () => void
  /** Override the line under the title. */
  hint?: string
  className?: string
}

/** The big "Make a request" card. One tap starts a voice conversation. */
export function RequestPanel({ state, onPress, hint, className }: RequestPanelProps) {
  const copy = COPY[state]
  const listening = state === 'listening'
  return (
    <button
      type="button"
      onClick={() => onPress()}
      disabled={state === 'unavailable'}
      aria-busy={state === 'connecting'}
      className={cn(
        'flex min-w-0 flex-col items-center justify-center gap-4 rounded-lg bg-surface p-7 text-center text-ink',
        'disabled:cursor-not-allowed',
        pressable,
        focusRing,
        className,
      )}
    >
      {listening ? (
        // MR6Loading: the mic with two rings spreading out from it.
        <span aria-hidden="true" className="relative size-disc-listen shrink-0">
          <span className="absolute inset-0 rounded-pill bg-action/35 motion-safe:animate-ripple" />
          <span className="absolute inset-0 rounded-pill bg-action/35 motion-safe:animate-ripple [animation-delay:1s]" />
          <span className="absolute inset-0 flex items-center justify-center rounded-pill bg-action text-on-action">
            <Icon name="mic" className="size-[76px]" />
          </span>
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'flex size-disc-xl items-center justify-center rounded-pill bg-action text-on-action shadow-[0_0_0_var(--size-ring)_var(--color-action-tint)]',
            state === 'unavailable' && 'bg-muted',
            state === 'connecting' && 'opacity-80',
          )}
        >
          <Icon name="mic" className="size-[84px]" />
        </span>
      )}
      <span
        className={cn('font-heading text-display-xl leading-none', listening ? 'mt-10' : 'mt-3')}
      >
        {copy.title}
      </span>
      <span className="text-lead text-muted" aria-live="polite">
        {hint ?? copy.hint}
      </span>
    </button>
  )
}
