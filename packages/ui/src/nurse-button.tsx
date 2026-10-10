'use client'

import type { ComponentProps } from 'react'
import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'

export type NurseButtonState = 'idle' | 'sending' | 'sent'

export interface NurseButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'onClick'> {
  onPress: () => void
  state?: NurseButtonState
  /** Idle label. Default "My nurse". */
  label?: string
  /** Shown while the call is being sent. Default "Calling…". */
  sendingLabel?: string
  /** Shown once the call went through. Default "Nurse called". */
  sentLabel?: string
}

const STATE_STYLES: Record<NurseButtonState, string> = {
  idle: 'bg-nurse text-on-nurse shadow-raised active:brightness-90',
  sending: 'cursor-progress bg-nurse text-on-nurse active:scale-100',
  sent: 'bg-nurse-tint text-nurse-ink inset-ring-3 inset-ring-nurse',
}

/**
 * The big "My nurse" call button. Every state shows a word, not just a color.
 * Presses are ignored while sending; in "sent" the button stays pressable so the
 * app can decide what a second press does.
 */
export function NurseButton({
  onPress,
  state = 'idle',
  label = 'My nurse',
  sendingLabel = 'Calling…',
  sentLabel = 'Nurse called',
  className,
  type = 'button',
  ...props
}: NurseButtonProps) {
  const sending = state === 'sending'
  const text = state === 'sending' ? sendingLabel : state === 'sent' ? sentLabel : label

  return (
    <>
      <button
        type={type}
        data-state={state}
        aria-disabled={sending || undefined}
        aria-busy={sending || undefined}
        onClick={(event) => {
          if (sending || props.disabled) {
            event.preventDefault()
            return
          }
          onPress()
        }}
        className={cn(
          'inline-flex min-h-tap-lg min-w-tap items-center justify-center gap-4 rounded-md py-3 ps-3 pe-8 font-body text-title font-bold disabled:cursor-not-allowed disabled:opacity-50',
          pressable,
          focusRing,
          STATE_STYLES[state],
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full',
            state === 'sent' ? 'bg-nurse text-on-nurse' : 'bg-on-nurse text-nurse',
          )}
        >
          {state === 'sending' ? (
            <Icon name="loader" className="size-7 animate-spin motion-reduce:animate-none" />
          ) : (
            <Icon
              name={state === 'sent' ? 'check' : 'nurse'}
              className="size-7"
              strokeWidth={2.25}
            />
          )}
        </span>
        <span>{text}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {state === 'idle' ? '' : text}
      </span>
    </>
  )
}
