'use client'

import { patientMessage, quotePatientWords } from '@bell/core/messages'
import {
  type CallRequest,
  type OptionId,
  optionById,
  REQUEST_GROUPS,
  type RequestDraft,
  type StreamEvent,
} from '@bell/core/taxonomy'
import {
  ConfirmSheet,
  GROUP_ICON,
  Icon,
  NurseButton,
  RequestTile,
  RoomButton,
  SheetClose,
  StatusPill,
  TalkButton,
} from '@bell/ui'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { callNurse, confirmDraft, discardDraft, sendOption, sendTyped } from '@/lib/client/api'
import { useLiveFeed } from '@/lib/client/use-live-feed'
import { clockTime, patientLabel } from '@/lib/format'
import { DraftCard } from './draft-card'
import { RoomSettingsPicker } from './room-settings'
import { useRoomSettings } from './use-room-settings'
import { useVoiceSession } from './use-voice-session'

type Group = (typeof REQUEST_GROUPS)[number]

const RECENT_LIMIT = 5
const SHEET_AUTO_CLOSE_MS = 15_000
const NURSE_SENT_MS = 5_000

/**
 * The confirmation sheet. Patient-facing text never names the team: titles come from
 * patientMessage ('sent' or 'nurse_notified'), the body says what was sent.
 */
type Sheet =
  | {
      kind: 'request'
      requestId: string
      /** What our own API call returned, until the live list has it. */
      request: CallRequest | null
      title: string
      description: string | null
    }
  | { kind: 'error'; title: string; description: null }

const newestPending = (drafts: RequestDraft[]): RequestDraft | null =>
  drafts
    .filter((d) => d.status === 'pending')
    .reduce<RequestDraft | null>(
      (newest, d) =>
        !newest || Date.parse(d.createdAt) > Date.parse(newest.createdAt) ? d : newest,
      null,
    )

interface RoomTabletProps {
  roomId: string
  voiceEnabled: boolean
}

export function RoomTablet({ roomId, voiceEnabled }: RoomTabletProps) {
  const { settings, update: updateSettings } = useRoomSettings(roomId)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [openGroup, setOpenGroup] = useState<Group | null>(null)
  const [nurseState, setNurseState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [sendingOption, setSendingOption] = useState(false)
  const [text, setText] = useState('')
  const [sendingText, setSendingText] = useState(false)
  const [draftBusy, setDraftBusy] = useState(false)
  const id = useId()
  // Requests created by confirming a draft (the draft event always arrives before the request's).
  const fromDraft = useRef(new Set<string>())

  /** The room's language for fixed words; with "auto", the language the patient used. */
  const lang = (used?: string | null) =>
    settings.language !== 'auto' ? settings.language : (used ?? 'auto')

  const showRequest = (request: CallRequest, title: string, description: string | null) =>
    setSheet({ kind: 'request', requestId: request.id, request, title, description })

  const showError = () =>
    setSheet({ kind: 'error', title: patientMessage('save_failed', lang()), description: null })

  const onEvent = (event: StreamEvent) => {
    if ('draft' in event) {
      const draft = event.draft
      if (event.type === 'draft.created') setOpenGroup(null)
      if (event.type === 'draft.updated' && draft.status === 'confirmed' && draft.requestId) {
        // Confirmed by a spoken yes (or by this screen): show that it went out.
        fromDraft.current.add(draft.requestId)
        setSheet({
          kind: 'request',
          requestId: draft.requestId,
          request: null,
          title: patientMessage('sent', lang(draft.decision.language)),
          description: draft.patientText,
        })
      }
      return
    }
    // A spoken request that skipped the draft step because the nurse was needed right away.
    const request = event.request
    if (
      event.type === 'request.created' &&
      request.source === 'voice' &&
      !fromDraft.current.has(request.id)
    ) {
      setOpenGroup(null)
      showRequest(
        request,
        patientMessage(
          request.team === 'nurse' ? 'nurse_notified' : 'sent',
          lang(request.language),
        ),
        request.text ? quotePatientWords(request.text, lang(request.language)) : null,
      )
    }
  }

  const { requests, drafts, upsertRequest, upsertDraft } = useLiveFeed({
    room: roomId,
    status: 'all',
    limit: RECENT_LIMIT,
    drafts: true,
    onEvent,
  })
  const voice = useVoiceSession({ roomId, language: settings.language, enabled: voiceEnabled })

  // A newer draft replaces an older pending one (the server discards the older one too).
  const pendingDraft = newestPending(drafts)
  const recent = [...requests]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, RECENT_LIMIT)

  // Close the confirmation by itself after a while.
  useEffect(() => {
    if (!sheet) return
    const timer = setTimeout(() => setSheet(null), SHEET_AUTO_CLOSE_MS)
    return () => clearTimeout(timer)
  }, [sheet])

  // Voice problems use the same sheet as other errors, so the layout never shifts.
  useEffect(() => {
    if (voice.error) setSheet({ kind: 'error', title: voice.error, description: null })
  }, [voice.error])

  useEffect(() => {
    if (nurseState !== 'sent') return
    const timer = setTimeout(() => setNurseState('idle'), NURSE_SENT_MS)
    return () => clearTimeout(timer)
  }, [nurseState])

  const pressNurse = async () => {
    if (nurseState === 'sending') return
    setNurseState('sending')
    setOpenGroup(null)
    try {
      const request = await callNurse(roomId)
      upsertRequest(request)
      setNurseState('sent')
      showRequest(request, patientMessage('nurse_notified', lang()), null)
    } catch {
      setNurseState('idle')
      showError()
    }
  }

  const sendRequestOption = async (optionId: OptionId) => {
    if (sendingOption) return
    setSendingOption(true)
    try {
      const request = await sendOption(roomId, optionId)
      upsertRequest(request)
      setOpenGroup(null)
      showRequest(request, patientMessage('sent', lang()), optionById(optionId).label)
    } catch {
      setOpenGroup(null)
      showError()
    } finally {
      setSendingOption(false)
    }
  }

  // A group with one option sends it right away; otherwise pick from its options.
  const pressGroup = (group: Group) => {
    const [only, ...rest] = group.requests
    if (only && rest.length === 0) void sendRequestOption(only.id)
    else setOpenGroup(group)
  }

  // Typed text becomes a draft to confirm, unless the nurse is needed right away.
  const submitText = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const message = text.trim()
    if (!message || sendingText) return
    setSendingText(true)
    try {
      const response = await sendTyped(roomId, message, settings.language)
      setText('')
      if (response.kind === 'draft') {
        upsertDraft(response.draft)
      } else {
        upsertRequest(response.request)
        showRequest(
          response.request,
          response.message,
          quotePatientWords(message, lang(response.request.language)),
        )
      }
    } catch {
      showError()
    } finally {
      setSendingText(false)
    }
  }

  const sendDraft = async (draft: RequestDraft) => {
    setDraftBusy(true)
    try {
      const result = await confirmDraft(draft.id)
      upsertDraft(result.draft)
      if (result.request) {
        fromDraft.current.add(result.request.id)
        upsertRequest(result.request)
        showRequest(
          result.request,
          patientMessage('sent', lang(draft.decision.language)),
          draft.patientText,
        )
      }
      // Let the voice helper stop waiting for a spoken yes.
      void voice.notifyDraftConfirmed(draft.id)
    } catch {
      showError()
    } finally {
      setDraftBusy(false)
    }
  }

  const cancelDraft = async (draft: RequestDraft) => {
    setDraftBusy(true)
    try {
      upsertDraft(await discardDraft(draft.id))
    } catch {
      // Already sent or gone: the live feed shows the real state.
    } finally {
      setDraftBusy(false)
    }
  }

  // The sheet shows the live status of the request it confirms.
  const sheetRequest =
    sheet?.kind === 'request'
      ? (requests.find((r) => r.id === sheet.requestId) ?? sheet.request)
      : null

  return (
    <div className="mx-auto flex h-dvh min-h-[768px] w-full max-w-[1024px] flex-col gap-3 p-5">
      <header className="flex items-center justify-between gap-6">
        <h1 className="text-display-lg text-ink">Room {roomId}</h1>
        <div className="flex items-center gap-4">
          <TalkButton
            state={voice.available ? voice.state : 'disabled'}
            onPress={voice.toggle}
            disabledReason="Voice isn't set up yet"
          />
          <NurseButton onPress={() => void pressNurse()} state={nurseState} />
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_17rem] gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <section aria-labelledby={`${id}-groups`} className="flex flex-1 flex-col">
            <h2 id={`${id}-groups`} className="sr-only">
              What do you need?
            </h2>
            <ul className="grid flex-1 auto-rows-fr grid-cols-4 gap-3">
              {REQUEST_GROUPS.map((group) => (
                <li key={group.id} className="flex">
                  <RequestTile
                    label={group.label}
                    hint={group.hint}
                    icon={<Icon name={GROUP_ICON[group.id]} />}
                    disabled={sendingOption}
                    onPress={() => pressGroup(group)}
                  />
                </li>
              ))}
            </ul>
          </section>

          {pendingDraft ? (
            <DraftCard
              key={pendingDraft.id}
              draft={pendingDraft}
              language={lang(pendingDraft.decision.language)}
              busy={draftBusy}
              onSend={() => void sendDraft(pendingDraft)}
              onCancel={() => void cancelDraft(pendingDraft)}
            />
          ) : (
            <form onSubmit={submitText} className="flex flex-col gap-2">
              <label htmlFor={`${id}-text`} className="text-lead text-ink">
                Type what you need
              </label>
              <div className="flex gap-3">
                <input
                  id={`${id}-text`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={500}
                  autoComplete="off"
                  placeholder="For example: my TV is not working"
                  className="min-h-tap min-w-0 flex-1 rounded-md border-2 border-border-strong bg-surface px-5 text-body text-ink placeholder:text-muted"
                />
                <RoomButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={sendingText || !text.trim()}
                  aria-busy={sendingText}
                >
                  {sendingText ? 'Checking…' : 'Next'}
                </RoomButton>
              </div>
            </form>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-4 rounded-lg bg-surface p-5">
          <section aria-labelledby={`${id}-recent`} className="flex min-h-0 flex-1 flex-col gap-3">
            <h2 id={`${id}-recent`} className="text-title text-ink">
              Your requests
            </h2>
            {recent.length === 0 ? (
              <p className="text-body text-muted">
                Nothing yet. What you ask for will show up here.
              </p>
            ) : (
              <ul className="flex min-h-0 flex-col gap-4 overflow-y-auto">
                {recent.map((request) => (
                  <li key={request.id} className="flex flex-col gap-1">
                    <span className="line-clamp-2 text-body text-ink">{patientLabel(request)}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusPill status={request.status} />
                      <span className="text-body text-muted">{clockTime(request.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <RoomSettingsPicker settings={settings} onChange={updateSettings} />
        </aside>
      </main>

      {/* Options of a group. Deliberately plain: the final look comes from the design canvas. */}
      <ConfirmSheet
        open={openGroup !== null}
        onOpenChange={(open) => {
          if (!open) setOpenGroup(null)
        }}
        title={openGroup?.label ?? ''}
        description="Tap what you need."
        actions={
          <SheetClose asChild>
            <RoomButton type="button" variant="ghost" size="lg">
              Never mind
            </RoomButton>
          </SheetClose>
        }
      >
        <ul className="grid grid-cols-2 gap-3">
          {openGroup?.requests.map((option) => (
            <li key={option.id} className="flex">
              <RoomButton
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                disabled={sendingOption}
                onClick={() => void sendRequestOption(option.id)}
              >
                {option.label}
              </RoomButton>
            </li>
          ))}
        </ul>
      </ConfirmSheet>

      <ConfirmSheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null)
        }}
        title={sheet?.title ?? ''}
        description={sheet?.description ?? undefined}
        status={sheetRequest?.status}
      />
    </div>
  )
}
