'use client'

import type { CallRequest, StreamEvent } from '@bell/core/taxonomy'
import type { ConversationAction, ConversationItem, VoiceStatus } from '@bell/ui'
import { useEffect, useRef, useState } from 'react'
import { isNurseCall, patientLabel, requestIcon } from '@/lib/client/patient-text'
import type { TranscriptEntry, VoiceMode, VoiceState } from './use-voice-session'

/** How long the transcript stays up after a hang-up before the panel goes back to idle. */
const LINGER_MS = 5_000

interface LoggedAction extends ConversationAction {
  /** The newest transcript entry when it happened (null: nothing said yet). */
  afterKey: string | null
}

const toChip = ({ afterKey: _afterKey, ...chip }: LoggedAction): ConversationAction => chip

const actionFor = (event: StreamEvent): ConversationAction | null => {
  const request: CallRequest = event.request
  if (event.type === 'request.created' && request.source === 'voice') {
    if (isNurseCall(request)) return { id: `nurse:${request.id}`, kind: 'nurse' }
    return {
      id: `sent:${request.id}`,
      kind: 'sent',
      label: patientLabel(request),
      icon: requestIcon(request),
    }
  }
  if (event.type === 'request.updated' && request.status === 'cancelled') {
    return {
      id: `cancelled:${request.id}`,
      kind: 'cancelled',
      label: patientLabel(request),
      icon: requestIcon(request),
    }
  }
  return null
}

/**
 * Chips go under the helper's reply to the words that caused them: the newest agent bubble when
 * it came after the patient's last words, otherwise the next reply once it starts. Until there is
 * one, they show as their own row after the words.
 */
const buildItems = (
  entries: readonly TranscriptEntry[],
  actions: readonly LoggedAction[],
): ConversationItem[] => {
  const position = new Map(entries.map((e, i) => [e.key, i]))
  const attached = new Map<number, LoggedAction[]>()
  const loose = new Map<string, LoggedAction[]>()
  for (const action of actions) {
    const start = action.afterKey === null ? 0 : (position.get(action.afterKey) ?? entries.length)
    const reply = entries.findIndex((e, i) => i >= start && e.from === 'agent')
    if (reply >= 0) {
      attached.set(reply, [...(attached.get(reply) ?? []), action])
    } else {
      const slot = action.afterKey ?? ''
      loose.set(slot, [...(loose.get(slot) ?? []), action])
    }
  }

  const items: ConversationItem[] = []
  const pushLoose = (slot: string) => {
    const group = loose.get(slot)
    if (group?.length)
      items.push({ kind: 'actions', id: `actions:${slot}`, actions: group.map(toChip) })
  }
  pushLoose('')
  entries.forEach((entry, i) => {
    items.push({
      kind: 'message',
      id: entry.key,
      from: entry.from,
      text: entry.text,
      live: !entry.final,
      ...(entry.from === 'agent' ? { actions: (attached.get(i) ?? []).map(toChip) } : {}),
    })
    pushLoose(entry.key)
  })
  return items
}

interface Options {
  mode: VoiceMode | null
  state: VoiceState
  transcript: readonly TranscriptEntry[]
}

/**
 * The "Make a request" conversation: shown while a request-mode voice session runs and for a few
 * seconds after it ends. Collects what the helper did (from this room's live events) as chips.
 */
export const useConversation = ({ mode, state, transcript }: Options) => {
  const [lingering, setLingering] = useState(false)
  const [actions, setActions] = useState<LoggedAction[]>([])
  const previousMode = useRef<VoiceMode | null>(mode)

  useEffect(() => {
    const previous = previousMode.current
    previousMode.current = mode
    if (mode === 'request' && previous !== 'request') {
      setLingering(false)
      setActions([])
      return
    }
    if (previous === 'request' && mode !== 'request') {
      setLingering(mode === null)
      const timer = setTimeout(() => {
        setLingering(false)
        setActions([])
      }, LINGER_MS)
      return () => clearTimeout(timer)
    }
  }, [mode])

  const shown = mode === 'request' || lingering

  /** Feed every room event here; only the helper's doings during the conversation become chips. */
  const record = (event: StreamEvent) => {
    if (!shown) return
    const action = actionFor(event)
    if (!action) return
    const afterKey = transcript[transcript.length - 1]?.key ?? null
    setActions((prev) =>
      prev.some((a) => a.id === action.id) ? prev : [...prev, { ...action, afterKey }],
    )
  }

  const status: VoiceStatus =
    mode !== 'request'
      ? 'ended'
      : state === 'connecting'
        ? 'connecting'
        : state === 'thinking'
          ? 'thinking'
          : state === 'speaking'
            ? 'speaking'
            : 'listening'

  return { shown, status, items: buildItems(transcript, actions), record }
}
