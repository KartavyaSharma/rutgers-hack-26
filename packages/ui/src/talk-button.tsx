'use client'

import type { ComponentProps } from 'react'
import { cn, focusRing, pressable } from './cn'
import { Icon } from './icon'

export type TalkButtonState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'disabled'

export interface TalkButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'onClick'> {
  state: TalkButtonState
  /** Tap to start; the app decides what a tap does in the other states (e.g. stop). */
  onPress: () => void
  /** Shown instead of the label when state is "disabled". */
  disabledReason?: string
  /** Optional second line under the state word, e.g. "Tap to stop". */
  hint?: string
}

/** Words shown for each state. "thinking" is when the request is being routed. */
export const TALK_STATE_LABELS: Record<TalkButtonState, string> = {
  idle: 'Tap to talk',
  connecting: 'Connecting…',
  listening: 'Listening…',
  thinking: 'Sending…',
  speaking: 'Speaking…',
  disabled: "Voice isn't available",
}

const ACTIVE_STATES: ReadonlySet<TalkButtonState> = new Set([
  'connecting',
  'listening',
  'thinking',
  'speaking',
])

/**
 * Tap-to-talk microphone button (tap, never hold). aria-pressed is true while a voice
 * session is active. The state word is visible and announced politely.
 * Looping animations stop under prefers-reduced-motion; the word and icon still change.
 */
export function TalkButton({
  state,
  onPress,
  disabledReason,
  hint,
  className,
  type = 'button',
  ...props
}: TalkButtonProps) {
  const disabled = state === 'disabled'
  const active = ACTIVE_STATES.has(state)
  const text = disabled ? (disabledReason ?? TALK_STATE_LABELS.disabled) : TALK_STATE_LABELS[state]

  return (
    <>
      <button
        type={type}
        data-state={state}
        aria-pressed={active}
        aria-disabled={disabled || undefined}
        aria-busy={state === 'connecting' || state === 'thinking' || undefined}
        onClick={(event) => {
          if (disabled || props.disabled) {
            event.preventDefault()
            return
          }
          onPress()
        }}
        className={cn(
          'inline-flex min-h-tap-lg min-w-tap items-center gap-4 rounded-pill py-2 ps-2 pe-8 text-start font-body',
          pressable,
          focusRing,
          state === 'idle' && 'bg-action text-on-action shadow-raised active:brightness-90',
          active && 'bg-surface text-ink shadow-raised inset-ring-3 inset-ring-action-ink',
          disabled &&
            'cursor-not-allowed bg-surface text-muted inset-ring-2 inset-ring-border active:scale-100',
          className,
        )}
        {...props}
      >
        <TalkIndicator state={state} />
        <span className="flex flex-col">
          <span className="text-lead font-bold">{text}</span>
          {hint && !disabled ? (
            <span className={cn('text-caption', state === 'idle' ? 'opacity-90' : 'text-muted')}>
              {hint}
            </span>
          ) : null}
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {state === 'idle' ? '' : text}
      </span>
    </>
  )
}

function TalkIndicator({ state }: { state: TalkButtonState }) {
  const disc = 'relative flex size-disc shrink-0 items-center justify-center rounded-full'

  switch (state) {
    case 'idle':
      return (
        <span className={cn(disc, 'bg-on-action text-action')}>
          <Icon name="mic" className="size-8" />
        </span>
      )
    case 'connecting':
      return (
        <span className={cn(disc, 'bg-action text-on-action')}>
          <Icon name="loader" className="size-8 animate-spin motion-reduce:animate-none" />
        </span>
      )
    case 'listening':
      return (
        <span className={cn(disc, 'bg-action text-on-action')}>
          {/* Expanding halo; under reduced motion it is a static ring instead. */}
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-listen rounded-full bg-action-ink motion-reduce:animate-none motion-reduce:bg-transparent motion-reduce:outline-solid motion-reduce:outline-4 motion-reduce:outline-offset-2 motion-reduce:outline-action-ink"
          />
          <Icon name="mic" className="relative size-8" />
        </span>
      )
    case 'thinking':
      return (
        <span className={cn(disc, 'gap-1.5 bg-action-tint text-action-ink')}>
          <span className="size-2.5 animate-dot rounded-full bg-current motion-reduce:animate-none" />
          <span className="size-2.5 animate-dot rounded-full bg-current [animation-delay:150ms] motion-reduce:animate-none" />
          <span className="size-2.5 animate-dot rounded-full bg-current [animation-delay:300ms] motion-reduce:animate-none" />
        </span>
      )
    case 'speaking':
      return (
        <span className={cn(disc, 'bg-action-tint text-action-ink')}>
          <Icon name="speaker" className="size-8" />
        </span>
      )
    case 'disabled':
      return (
        <span className={cn(disc, 'bg-bg text-muted')}>
          <Icon name="mic-off" className="size-8" />
        </span>
      )
  }
}
