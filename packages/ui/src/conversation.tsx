'use client'

import { useEffect, useRef } from 'react'
import { cn, focusRing, pressable } from './cn'
import { Icon, type IconName } from './icon'
import { RequestPanel } from './request-panel'
import { type Translate, useT } from './text'

/** Something the voice helper did, shown as a chip under its reply. Never names a team. */
export interface ConversationAction {
  id: string
  /** sent: "Sent · Water"; cancelled: "Cancelled · Water"; nurse: "Nurse called" (red). */
  kind: 'sent' | 'cancelled' | 'nurse'
  /** What it was about, e.g. "Water" (not shown for nurse). */
  label?: string
  icon?: IconName
}

export type ConversationItem =
  | {
      kind: 'message'
      id: string
      from: 'patient' | 'agent'
      text: string
      /** Still being spoken: the words update in place. */
      live?: boolean
      /** Agent replies only: what the helper did around this reply. */
      actions?: readonly ConversationAction[]
    }
  /** Actions that happened before the helper said anything. */
  | { kind: 'actions'; id: string; actions: readonly ConversationAction[] }

const CHIP_STYLES: Record<ConversationAction['kind'], string> = {
  sent: 'bg-action-tint text-action-ink',
  cancelled: 'border-2 border-border text-muted',
  // Red is reserved for the nurse.
  nurse: 'bg-nurse-tint text-nurse-ink',
}

const chipText = (action: ConversationAction, t: Translate): string => {
  switch (action.kind) {
    case 'nurse':
      return t('Nurse called')
    case 'cancelled':
      return action.label ? `${t('Cancelled')} · ${action.label}` : t('Cancelled')
    default:
      return action.label ? `${t('Sent')} · ${action.label}` : t('Sent')
  }
}

export function ActionChip({ action }: { action: ConversationAction }) {
  const t = useT()
  const icon: IconName = action.kind === 'nurse' ? 'alert' : (action.icon ?? 'check')
  return (
    <li
      className={cn(
        'inline-flex items-center gap-2 rounded-pill px-4 py-1.5 text-body font-bold',
        CHIP_STYLES[action.kind],
      )}
    >
      <Icon name={icon} className="size-6" />
      {chipText(action, t)}
    </li>
  )
}

function ActionRow({ actions }: { actions: readonly ConversationAction[] }) {
  return (
    <ul aria-label="What I did" className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <ActionChip key={action.id} action={action} />
      ))}
    </ul>
  )
}

export interface ConversationProps {
  items: readonly ConversationItem[]
  /** Shown before anything is said. */
  emptyText?: string
  className?: string
}

/**
 * The live transcript as chat bubbles: the patient on the right, the voice helper on the left
 * with what it did as chips underneath. Follows the newest words unless the reader scrolled up.
 */
export function Conversation({
  items,
  emptyText = 'Say what you need.',
  className,
}: ConversationProps) {
  const t = useT()
  const scroller = useRef<HTMLDivElement>(null)
  const last = items[items.length - 1]
  const lastText = last?.kind === 'message' ? last.text : undefined
  const lastActions = last?.kind === 'message' ? last.actions?.length : last?.actions.length

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run whenever the newest item grows
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (nearBottom) el.scrollTo({ top: el.scrollHeight })
  }, [items.length, lastText, lastActions])

  return (
    <div
      ref={scroller}
      role="log"
      aria-label="Conversation"
      className={cn('min-h-0 overflow-y-auto', className)}
    >
      {items.length === 0 ? (
        <p className="flex h-full items-center justify-center text-center text-lead text-muted">
          {t(emptyText)}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {items.map((item) =>
            item.kind === 'actions' ? (
              <li key={item.id}>
                <ActionRow actions={item.actions} />
              </li>
            ) : (
              <li
                key={item.id}
                className={cn(
                  'flex flex-col gap-2',
                  item.from === 'patient' ? 'items-end' : 'items-start',
                )}
              >
                <p
                  className={cn(
                    'max-w-[85%] rounded-lg px-5 py-3 text-lead leading-body whitespace-pre-wrap',
                    item.from === 'patient'
                      ? 'rounded-br-sm bg-action-tint text-ink'
                      : 'rounded-bl-sm bg-bg text-ink',
                    item.live && 'text-muted',
                  )}
                >
                  <span className="sr-only">{item.from === 'patient' ? 'You: ' : 'Bell: '}</span>
                  {item.text}
                  {item.live ? <span aria-hidden="true"> …</span> : null}
                </p>
                {item.from === 'agent' && item.actions?.length ? (
                  <ActionRow actions={item.actions} />
                ) : null}
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  )
}

export type VoiceStatus = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended'

const STATUS_WORDS: Record<VoiceStatus, string> = {
  connecting: 'Getting ready…',
  listening: "I'm listening · Say what you need.",
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  ended: 'Finished. Tap to talk again',
}

export interface VoiceStatusBarProps {
  status: VoiceStatus
  /** Ends the conversation, or starts a new one once it has ended. */
  onPress: () => void
  className?: string
}

/** The mic status at the bottom of the conversation (where a chat app has its message box). */
export function VoiceStatusBar({ status, onPress, className }: VoiceStatusBarProps) {
  const t = useT()
  const active = status === 'listening' || status === 'speaking'
  return (
    <button
      type="button"
      onClick={() => onPress()}
      aria-busy={status === 'connecting' || status === 'thinking'}
      className={cn(
        'flex min-h-tap-xl w-full items-center gap-4 rounded-pill border-2 border-border bg-bg py-2 pr-6 pl-2 text-left text-ink',
        pressable,
        focusRing,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-disc shrink-0 items-center justify-center rounded-pill',
          status === 'ended' ? 'bg-action-tint text-action-ink' : 'bg-action text-on-action',
          active && 'motion-safe:animate-ripple-soft',
        )}
      >
        <Icon name="mic" className="size-8" />
      </span>
      <span className="text-lead font-bold" aria-live="polite">
        {t(STATUS_WORDS[status])}
      </span>
    </button>
  )
}

export interface ConversationPanelProps extends ConversationProps {
  status: VoiceStatus
  onPress: () => void
}

/**
 * The "Make a request" card while a voice conversation runs. Before anything is said it is the
 * listening view (MR6Loading: the mic with spreading rings, "I'm listening / Say what you need."),
 * then the transcript as bubbles with the mic status below.
 */
export function ConversationPanel({
  items,
  emptyText,
  status,
  onPress,
  className,
}: ConversationPanelProps) {
  if (items.length === 0) {
    return (
      <RequestPanel
        state={status === 'ended' ? 'idle' : status === 'connecting' ? 'connecting' : 'listening'}
        onPress={onPress}
        {...(className ? { className } : {})}
      />
    )
  }
  return (
    <section
      aria-label="Make a request"
      className={cn('flex min-w-0 flex-col gap-4 rounded-lg bg-surface p-5', className)}
    >
      <Conversation items={items} {...(emptyText ? { emptyText } : {})} className="flex-1 px-1" />
      <VoiceStatusBar status={status} onPress={onPress} />
    </section>
  )
}
