import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'
import type { RequestPanelState } from './request-panel'

const COPY: Record<RequestPanelState, { title: string; hint: string }> = {
  idle: { title: 'Tap to speak', hint: 'Request something or ask a question' },
  connecting: { title: 'Tap to speak', hint: 'Getting ready…' },
  listening: { title: "I'm listening", hint: 'Say what you need.' },
  unavailable: { title: 'Tap to speak', hint: "Voice isn't set up yet" },
}

export interface MicTileProps {
  state: RequestPanelState
  /** Tap to start talking; tap again while listening to finish. */
  onPress: () => void
  /** Line under "I'm listening", e.g. "Tap an option or speak your request" on a category. */
  listeningHint?: string
  className?: string
}

const BARS = [31, 69, 46, 83, 38]

/**
 * The mic in the left column with voice only off. Anything said here goes to the nurse to
 * approve. "Hey Bell" is a line of text only; the wake word is not built.
 */
export function MicTile({ state, onPress, listeningHint, className }: MicTileProps) {
  const copy = COPY[state]
  const listening = state === 'listening'
  return (
    <button
      type="button"
      onClick={() => onPress()}
      disabled={state === 'unavailable'}
      aria-busy={state === 'connecting'}
      className={cn(
        'flex min-h-0 flex-col items-center rounded-md bg-surface px-5 pt-6 pb-5 text-center text-ink',
        'disabled:cursor-not-allowed',
        pressable,
        focusRing,
        className,
      )}
    >
      <span className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[18px]">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-[130px] shrink-0 items-center justify-center gap-1.5 rounded-pill bg-action text-on-action',
            listening && 'shadow-[0_0_0_10px_var(--color-action-tint)]',
            state === 'unavailable' && 'bg-muted',
            state === 'connecting' && 'opacity-80',
          )}
        >
          {listening ? (
            BARS.map((h, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
              <span key={i} className="w-2.5 rounded-pill bg-on-action" style={{ height: h }} />
            ))
          ) : (
            <Icon name="mic" className="size-[57px]" />
          )}
        </span>
        <span className="flex flex-col gap-1.5">
          <span className="font-heading text-[30px] leading-tight">{copy.title}</span>
          <span className="text-body text-muted" aria-live="polite">
            {listening && listeningHint ? listeningHint : copy.hint}
          </span>
        </span>
      </span>
      {state === 'idle' ? (
        <span className="mt-3 text-caption text-muted">or just say “Hey Bell”</span>
      ) : null}
    </button>
  )
}
