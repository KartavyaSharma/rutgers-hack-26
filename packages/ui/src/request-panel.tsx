import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'

export type RequestPanelState = 'idle' | 'connecting' | 'listening' | 'unavailable'

const COPY: Record<RequestPanelState, { title: string; hint: string }> = {
  idle: { title: 'Make a request', hint: 'Tap here to talk' },
  connecting: { title: 'Make a request', hint: 'Getting ready…' },
  listening: { title: "I'm listening", hint: "Say what you need. Tap here when you're done." },
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
      <span
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center rounded-pill bg-action text-on-action',
          listening
            ? 'size-disc-listen shadow-[0_0_0_var(--size-ring)_var(--color-action-tint),0_0_0_calc(var(--size-ring)*2)_var(--color-action-tint-soft)] motion-safe:animate-ripple-soft'
            : 'size-disc-xl shadow-[0_0_0_var(--size-ring)_var(--color-action-tint)]',
          state === 'unavailable' && 'bg-muted',
          state === 'connecting' && 'opacity-80',
        )}
      >
        <Icon name="mic" className={listening ? 'size-[76px]' : 'size-[84px]'} />
      </span>
      <span
        className={cn('font-heading text-display-xl leading-none', listening ? 'mt-5' : 'mt-3')}
      >
        {copy.title}
      </span>
      <span className="text-lead text-muted" aria-live="polite">
        {hint ?? copy.hint}
      </span>
    </button>
  )
}
