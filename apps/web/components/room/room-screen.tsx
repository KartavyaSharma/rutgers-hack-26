'use client'

import { helpButtonLabel } from '@bell/core/messages'
import {
  type CallRequest,
  isLanguagePreference,
  isOpenStatus,
  type LanguagePreference,
  REQUESTS_CANCELLED_RPC,
  type StreamEvent,
} from '@bell/core/taxonomy'
import {
  AppHeader,
  Button,
  ConversationPanel,
  Dialog,
  DialogClose,
  EmergencyScreen,
  type EmergencyVoiceState,
  HelpButton,
  LanguagePicker,
  type MyRequestItem,
  MyRequestsSheet,
  RequestCard,
  RequestPanel,
  type RequestPanelState,
  RequestSentCard,
  RoomControls,
  Sheet,
} from '@bell/ui'
import { useEffect, useState } from 'react'
import { callForHelp, requestAction } from '@/lib/client/api'
import {
  allSetTitle,
  CHOOSE_LANGUAGE_SUBTITLE,
  continueLabel,
  isNurseCall,
  LANGUAGE_OPTIONS,
  languageDir,
  languageName,
  MOST_USED_OPTIONS,
  patientLabel,
  requestIcon,
  statusLine,
  timeAgo,
} from '@/lib/client/patient-text'
import { isFirstRun, loadRoomSettings, saveRoomLanguage } from '@/lib/client/room-settings'
import { useLiveFeed } from '@/lib/client/use-live-feed'
import { useConversation } from './use-conversation'
import { useRoomControls } from './use-room-controls'
import { useVoiceSession } from './use-voice-session'

const HOME_CARDS = 2
const FEED_LIMIT = 100
const TICK_MS = 30_000

/** The "Request sent" card closes by itself after this long (MRSentB1 plus the timer border). */
const SENT_CARD_SECONDS = 10

type SheetName = 'room' | 'requests'

type DialogState =
  /** A call that went straight to the nurse (the red overlay on the boards). */
  | { kind: 'nurse' }
  /** "You're all set · Español" after the language screen. */
  | { kind: 'all-set'; language: LanguagePreference }
  | { kind: 'error'; title: string; body?: string }

/** What a spoken sentence just sent, shown in the Make a request panel until confirmed. */
interface SentCard {
  requests: CallRequest[]
  /** Changes when a request joins, to restart the timer. */
  key: number
}

const newestFirst = (a: CallRequest, b: CallRequest) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt)

const sameDay = (iso: string, now: number) =>
  new Date(iso).toDateString() === new Date(now).toDateString()

const toItem = (request: CallRequest, now: number): MyRequestItem => ({
  id: request.id,
  label: patientLabel(request),
  icon: requestIcon(request),
  status: request.status,
  line: statusLine(request.status),
  when: timeAgo(request.createdAt, now),
  nudged: request.nudgedAt !== null,
})

interface RoomScreenProps {
  roomId: string
  voiceEnabled: boolean
}

/** The patient tablet (1024×768, Clay): Make a request, help, My requests, language, room. */
export function RoomScreen({ roomId, voiceEnabled }: RoomScreenProps) {
  const [language, setLanguage] = useState<LanguagePreference>('auto')
  // The full-screen language screen: on first run, or from the header's Language button.
  const [languageScreen, setLanguageScreen] = useState(false)
  const [pickerValue, setPickerValue] = useState<LanguagePreference>('auto')
  const [sheet, setSheet] = useState<SheetName | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [sentCard, setSentCard] = useState<SentCard | null>(null)
  const [deletingSent, setDeletingSent] = useState(false)
  const [helpBusy, setHelpBusy] = useState(false)
  const [cancellingHelp, setCancellingHelp] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const settings = loadRoomSettings(roomId)
    setLanguage(settings.language)
    setPickerValue(settings.language)
    setLanguageScreen(isFirstRun(roomId))
  }, [roomId])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const voice = useVoiceSession({ roomId, language, enabled: voiceEnabled })
  const room = useRoomControls(roomId)
  const conversation = useConversation({
    mode: voice.mode,
    state: voice.state,
    transcript: voice.transcript,
  })

  // A spoken request was classified and sent. A nurse call gets the red "Your nurse has been
  // told" overlay; anything else shows the "Request sent" card in the panel. One sentence can
  // send several requests a moment apart: they join the card that is up and restart its timer.
  const onEvent = (event: StreamEvent) => {
    conversation.record(event)
    const request = event.request
    if (event.type !== 'request.created' || request.source !== 'voice') return
    setSheet(null)
    if (isNurseCall(request)) {
      setDialog({ kind: 'nurse' })
      return
    }
    setSentCard((card) => {
      if (!card) return { requests: [request], key: Date.now() }
      if (card.requests.some((r) => r.id === request.id)) return card
      return { requests: [...card.requests, request], key: Date.now() }
    })
  }
  const { requests, upsertRequest } = useLiveFeed({
    room: roomId,
    status: 'all',
    limit: FEED_LIMIT,
    onEvent,
  })

  const sorted = [...requests].sort(newestFirst)
  // The emergency screen stays up while an urgent help call is open, also after a reload.
  const emergency =
    sorted.find(
      (r) => r.source === 'nurse_button' && r.urgency === 'urgent' && isOpenStatus(r.status),
    ) ?? null
  const open = sorted.filter((r) => isOpenStatus(r.status))
  // While the "Request sent" card is up, its requests are not repeated in the home cards.
  const onCard = new Set(sentCard?.requests.map((r) => r.id) ?? [])
  const homeCards = open.filter((r) => !onCard.has(r.id)).slice(0, HOME_CARDS)
  const earlier = sorted.filter((r) => !isOpenStatus(r.status) && sameDay(r.updatedAt, now))

  // Hang up the emergency conversation once the call is done or cancelled.
  const emergencyId = emergency?.id ?? null
  const { mode: voiceMode, stop: stopVoice } = voice
  useEffect(() => {
    if (!emergencyId && voiceMode === 'emergency') void stopVoice()
  }, [emergencyId, voiceMode, stopVoice])

  // Voice problems use the same dialog as other errors, except on the emergency screen:
  // there the mic simply goes back to "Tap to talk" and nothing covers "Help is on the way".
  const { error: voiceError, clearError: clearVoiceError } = voice
  useEffect(() => {
    if (!voiceError) return
    if (emergencyId) clearVoiceError()
    else setDialog({ kind: 'error', title: voiceError })
  }, [voiceError, emergencyId, clearVoiceError])

  const panelState: RequestPanelState = !voice.available
    ? 'unavailable'
    : voice.mode === 'request'
      ? voice.state === 'connecting'
        ? 'connecting'
        : 'listening'
      : 'idle'

  const emergencyVoice: EmergencyVoiceState = !voice.available
    ? 'off'
    : voice.mode === 'emergency'
      ? voice.state === 'connecting'
        ? 'connecting'
        : 'listening'
      : 'idle'

  const pressPanel = () => {
    if (voice.mode === 'request') void voice.stop()
    else void voice.start({ mode: 'request' })
  }

  const pressHelp = async () => {
    if (helpBusy) return
    setHelpBusy(true)
    setSheet(null)
    setDialog(null)
    try {
      if (voice.mode) await voice.stop()
      const request = await callForHelp(roomId)
      upsertRequest(request)
      if (voice.available) void voice.start({ mode: 'emergency', emergencyRequestId: request.id })
    } catch {
      setDialog({
        kind: 'error',
        title: "That didn't go through",
        body: 'Please press the red button on your bed rail.',
      })
    } finally {
      setHelpBusy(false)
    }
  }

  const talkInEmergency = () => {
    if (emergency) void voice.start({ mode: 'emergency', emergencyRequestId: emergency.id })
  }

  const pressMistake = async () => {
    if (!emergency || cancellingHelp) return
    setCancellingHelp(true)
    try {
      upsertRequest(await requestAction(emergency.id, 'cancel'))
      if (voice.mode === 'emergency') await voice.stop()
    } catch {
      setDialog({ kind: 'error', title: "That didn't go through", body: 'Please try again.' })
    } finally {
      setCancellingHelp(false)
    }
  }

  const act = async (id: string, action: 'cancel' | 'nudge') => {
    setBusyId(id)
    try {
      upsertRequest(await requestAction(id, action))
      return true
    } catch {
      setDialog({ kind: 'error', title: "That didn't go through", body: 'Please try again.' })
      return false
    } finally {
      setBusyId(null)
    }
  }

  // "Delete" on the Request sent card: cancel what was just sent and tell the voice helper.
  const deleteSent = async () => {
    if (!sentCard || deletingSent) return
    const requestIds = sentCard.requests.map((r) => r.id)
    setDeletingSent(true)
    try {
      const results = await Promise.allSettled(requestIds.map((id) => requestAction(id, 'cancel')))
      for (const result of results) if (result.status === 'fulfilled') upsertRequest(result.value)
      void voice.notifyAgent(REQUESTS_CANCELLED_RPC, { requestIds })
      setSentCard(null)
      if (results.some((r) => r.status === 'rejected')) {
        setDialog({ kind: 'error', title: "That didn't go through", body: 'Please try again.' })
      }
    } finally {
      setDeletingSent(false)
    }
  }

  const openLanguageScreen = () => {
    setPickerValue(language)
    setLanguageScreen(true)
  }

  // Continue: save it, then "You're all set" over the language screen.
  const continueLanguage = () => {
    setLanguage(pickerValue)
    saveRoomLanguage(roomId, pickerValue)
    setDialog({ kind: 'all-set', language: pickerValue })
  }

  const controls = room.controls
  const roomStatus = controls ? `${controls.temperatureF}° · Lights ${controls.lights}%` : undefined

  return (
    <div className="relative mx-auto flex h-dvh min-h-[768px] w-full max-w-[1024px] flex-col gap-[18px] overflow-hidden bg-bg px-7 pt-[26px] pb-7 text-ink">
      <AppHeader
        title={`Room ${roomId}`}
        subtitle="Tap to request help"
        languageLabel={languageName(language)}
        onLanguage={openLanguageScreen}
        {...(roomStatus ? { roomStatus } : {})}
        onRoom={() => {
          setSheet('room')
          void room.refresh()
        }}
      />

      <main className="flex min-h-0 flex-1 gap-[18px]">
        {sentCard ? (
          <RequestSentCard
            className="flex-1"
            items={sentCard.requests.map((r) => ({
              id: r.id,
              label: patientLabel(r),
              icon: requestIcon(r),
            }))}
            listening={voice.mode === 'request'}
            seconds={SENT_CARD_SECONDS}
            resetKey={sentCard.key}
            onDone={() => setSentCard(null)}
            onDelete={() => void deleteSent()}
            deleting={deletingSent}
          />
        ) : conversation.shown ? (
          <ConversationPanel
            className="flex-1"
            items={conversation.items}
            status={conversation.status}
            onPress={pressPanel}
          />
        ) : (
          <RequestPanel className="flex-1" state={panelState} onPress={pressPanel} />
        )}

        <div className="flex w-column shrink-0 flex-col gap-4">
          <HelpButton
            className="min-h-0 flex-1"
            label={helpButtonLabel(language)}
            onPress={() => void pressHelp()}
            busy={helpBusy}
          />

          <section
            aria-labelledby="my-requests-title"
            className="flex min-h-0 flex-1 flex-col gap-2"
          >
            <div className="flex items-center justify-between px-1.5">
              <h2
                id="my-requests-title"
                className="font-body text-body font-bold tracking-[0.06em] text-muted uppercase"
              >
                My requests
              </h2>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setSheet('requests')}
                className="px-1 text-action-ink underline underline-offset-4"
              >
                {open.length > 0 ? 'See all' : 'See past'}
              </Button>
            </div>
            {homeCards.length > 0 ? (
              <ul className="flex min-h-0 flex-1 flex-col gap-3">
                {homeCards.map((request) => (
                  <li key={request.id} className="flex min-h-0 flex-1">
                    <RequestCard
                      className="h-full max-h-[140px]"
                      label={patientLabel(request)}
                      icon={requestIcon(request)}
                      status={request.status}
                      onPress={() => setSheet('requests')}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 rounded-md border-2 border-dashed border-border px-6">
                <p className="font-heading text-heading leading-tight text-muted">
                  Nothing right now
                </p>
                <p className="text-body text-muted">Your requests will show here.</p>
              </div>
            )}
          </section>
        </div>
      </main>

      <Sheet
        open={sheet === 'room'}
        onOpenChange={(isOpen) => setSheet(isOpen ? 'room' : null)}
        title="Your room"
      >
        {controls ? (
          <RoomControls
            lights={controls.lights}
            temperatureF={controls.temperatureF}
            blinds={controls.blinds}
            tvOn={controls.tv.power}
            onLights={(lights) => void room.update({ lights })}
            onTemperature={(temperatureF) => void room.update({ temperatureF })}
            onBlinds={(blinds) => void room.update({ blinds })}
            onTv={(power) => void room.update({ tv: { power } })}
          />
        ) : (
          <p className="text-lead text-muted">
            {room.failed ? "Room controls aren't available right now." : 'Loading…'}
          </p>
        )}
      </Sheet>

      <MyRequestsSheet
        open={sheet === 'requests'}
        onOpenChange={(isOpen) => setSheet(isOpen ? 'requests' : null)}
        openItems={open.map((r) => toItem(r, now))}
        earlierItems={earlier.map((r) => toItem(r, now))}
        onNudge={(id) => void act(id, 'nudge')}
        onCancel={(id) => void act(id, 'cancel')}
        busyId={busyId}
      />

      <Dialog
        open={dialog?.kind === 'nurse'}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        tone="nurse"
        title="Your nurse has been told"
        body="They can see your call now. If you feel worse, press the red button on your bed rail."
        actions={
          <DialogClose asChild>
            <Button variant="nurse" size="lg">
              Okay
            </Button>
          </DialogClose>
        }
      />

      <Dialog
        open={dialog?.kind === 'all-set'}
        onOpenChange={(isOpen) => {
          if (isOpen) return
          setDialog(null)
          setLanguageScreen(false)
        }}
        title={dialog?.kind === 'all-set' ? allSetTitle(dialog.language) : ''}
        body="You can change this any time with the Language button."
        actions={
          <>
            <DialogClose asChild>
              <Button variant="primary" size="lg">
                Okay
              </Button>
            </DialogClose>
            {/* Back: stay on the language screen to pick another one. */}
            <Button variant="secondary" size="lg" onClick={() => setDialog(null)}>
              Back
            </Button>
          </>
        }
      />

      <Dialog
        open={dialog?.kind === 'error'}
        onOpenChange={(isOpen) => {
          if (isOpen) return
          setDialog(null)
          voice.clearError()
        }}
        title={dialog?.kind === 'error' ? dialog.title : ''}
        {...(dialog?.kind === 'error' && dialog.body ? { body: dialog.body } : {})}
        actions={
          <DialogClose asChild>
            <Button variant="primary" size="lg">
              Okay
            </Button>
          </DialogClose>
        }
      />

      {languageScreen ? (
        <LanguagePicker
          options={LANGUAGE_OPTIONS}
          mostUsed={MOST_USED_OPTIONS}
          value={pickerValue}
          onChange={(value) => {
            if (isLanguagePreference(value)) setPickerValue(value)
          }}
          onContinue={continueLanguage}
          continueLabel={continueLabel(pickerValue)}
          {...(pickerValue === 'auto' ? {} : { continueLang: pickerValue })}
          continueDir={languageDir(pickerValue)}
          subtitle={CHOOSE_LANGUAGE_SUBTITLE}
        />
      ) : null}

      {emergency ? (
        <EmergencyScreen
          // Fixed, not absolute: cover the whole viewport, not just the 1024px tablet frame.
          className="fixed z-40"
          voice={emergencyVoice}
          onTalk={talkInEmergency}
          onMistake={() => void pressMistake()}
          cancelling={cancellingHelp}
        />
      ) : null}
    </div>
  )
}
