'use client'

import { helpButtonLabel } from '@bell/core/messages'
import {
  type CallRequest,
  isLanguagePreference,
  isOpenStatus,
  type LanguageCode,
  type LanguagePreference,
  REQUESTS_CANCELLED_RPC,
  type StreamEvent,
} from '@bell/core/taxonomy'
import {
  AppHeader,
  Button,
  CategoryButton,
  ChartNotice,
  ChartTags,
  ConversationPanel,
  Dialog,
  DialogClose,
  EmergencyScreen,
  type EmergencyVoiceState,
  HelpButton,
  LanguagePicker,
  MicTile,
  type MyRequestItem,
  MyRequestsSheet,
  OptionTile,
  RequestCard,
  RequestPanel,
  type RequestPanelState,
  RequestSentCard,
  RequestSentPanel,
  SomethingElseTile,
  TextProvider,
  TitleRow,
  type Translate,
  useT,
} from '@bell/ui'
import { useEffect, useState } from 'react'
import { callForHelp, requestAction, resolveRequest, sendOption } from '@/lib/client/api'
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
import {
  isFirstRun,
  loadRoomSettings,
  loadVoiceOnly,
  saveRoomLanguage,
  saveVoiceOnly,
} from '@/lib/client/room-settings'
import { useLiveFeed } from '@/lib/client/use-live-feed'
import { CATEGORIES, type Category, type PatientOption, screenFor } from '@/lib/patient/catalog'
import type { PatientInRoom } from '@/lib/patient/chart'
import { useConversation } from './use-conversation'
import { useVoiceSession } from './use-voice-session'
import { useWakePhrase } from './use-wake-phrase'
import { useScreenText } from '@/lib/patient/screen-text'

const HOME_CARDS = 2
const FEED_LIMIT = 100
const TICK_MS = 30_000

/** The "Request sent" card closes by itself after this long (MRSentB1 plus the timer border). */
const SENT_CARD_SECONDS = 10

type DialogState =
  /** A call that went straight to the nurse (the red overlay on the boards). */
  | { kind: 'nurse' }
  /** "You're all set · Español" after the language screen. */
  | { kind: 'all-set'; language: LanguagePreference }
  | { kind: 'error'; title: string; body?: string }

/** What was just sent, shown in place until confirmed. */
interface SentCard {
  requests: CallRequest[]
  /** Changes when a request joins, to restart the timer. */
  key: number
  /** Sent from the mic (spoken), not from an option button. */
  spoken: boolean
}

const newestFirst = (a: CallRequest, b: CallRequest) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt)

const sameDay = (iso: string, now: number) =>
  new Date(iso).toDateString() === new Date(now).toDateString()

const toItem = (request: CallRequest, now: number, t: Translate): MyRequestItem => ({
  id: request.id,
  label: patientLabel(request, t),
  icon: requestIcon(request),
  status: request.status,
  line: statusLine(request.status, t),
  when: timeAgo(request.createdAt, now, t),
  nudged: request.nudgedAt !== null,
})


interface RoomScreenProps {
  patient: PatientInRoom
  voiceEnabled: boolean
}

/**
 * The patient tablet (1024×768, Clay), in two modes. Voice only: the big mic, the emergency
 * button and My requests. Voice only off: emergency and mic on the left, eight category
 * buttons, and category screens whose options follow the patient's chart.
 */
export function RoomScreen({ patient, voiceEnabled }: RoomScreenProps) {
  const roomId = patient.roomId
  const [language, setLanguage] = useState<LanguagePreference>('auto')
  const [voiceOnly, setVoiceOnly] = useState(true)
  const [category, setCategory] = useState<Category | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  // The full-screen language screen: on first run, or from the header's Language button.
  const [languageScreen, setLanguageScreen] = useState(false)
  const [pickerValue, setPickerValue] = useState<LanguagePreference>('auto')
  const [requestsOpen, setRequestsOpen] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [sentCard, setSentCard] = useState<SentCard | null>(null)
  const [deletingSent, setDeletingSent] = useState(false)
  const [helpBusy, setHelpBusy] = useState(false)
  const [cancellingHelp, setCancellingHelp] = useState(false)
  const [resolvingHelp, setResolvingHelp] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const settings = loadRoomSettings(roomId)
    setLanguage(settings.language)
    setPickerValue(settings.language)
    setVoiceOnly(loadVoiceOnly(roomId))
    setLanguageScreen(isFirstRun(roomId))
  }, [roomId])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const t = useScreenText(language)

  // The first language Bell hears (other than English) switches the screen from Auto; after
  // that the patient decides, by voice ("in English, please") or with the Language button.
  const followVoiceLanguage = (code: LanguageCode, how: 'heard' | 'asked') => {
    if (code === language || (how === 'heard' && (language !== 'auto' || code === 'en'))) return
    setLanguage(code)
    setPickerValue(code)
    saveRoomLanguage(roomId, code)
  }

  const voice = useVoiceSession({
    roomId,
    language,
    enabled: voiceEnabled,
    onLanguage: followVoiceLanguage,
  })
  const conversation = useConversation({
    mode: voice.mode,
    state: voice.state,
    transcript: voice.transcript,
  })

  // A spoken request was classified and sent. A nurse call gets the red "Your nurse has been
  // told" overlay; anything else shows the "Request sent" card. One sentence can send several
  // requests a moment apart: they join the card that is up and restart its timer.
  const onEvent = (event: StreamEvent) => {
    conversation.record(event)
    const request = event.request
    if (event.type !== 'request.created' || request.source !== 'voice') return
    setRequestsOpen(false)
    if (isNurseCall(request)) {
      setDialog({ kind: 'nurse' })
      return
    }
    setSentCard((card) => {
      if (!card) return { requests: [request], key: Date.now(), spoken: true }
      if (card.requests.some((r) => r.id === request.id)) return card
      return { ...card, requests: [...card.requests, request], key: Date.now() }
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

  const micState: RequestPanelState = !voice.available
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

  const pressMic = () => {
    if (voice.mode === 'request') void voice.stop()
    else void voice.start({ mode: 'request' })
  }

  // "Hey Bell" opens the same listening as a mic tap. It is heard on the tablet only.
  useWakePhrase({
    active: voice.available && !voice.mode && voice.state === 'idle' && !emergencyId,
    onWake: () => void voice.start({ mode: 'request' }),
  })

  const pressHelp = async () => {
    if (helpBusy) return
    setHelpBusy(true)
    setRequestsOpen(false)
    setDialog(null)
    try {
      if (voice.mode) await voice.stop()
      const request = await callForHelp(roomId)
      upsertRequest(request)
      if (voice.available) void voice.start({ mode: 'emergency', emergencyRequestId: request.id })
    } catch {
      setDialog({
        kind: 'error',
        title: t("That didn't go through"),
        body: t('Please press the red button on your bed rail.'),
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
      setDialog({
        kind: 'error',
        title: t("That didn't go through"),
        body: t('Please try again.'),
      })
    } finally {
      setCancellingHelp(false)
    }
  }

  // "Resolved by staff": the nurse who came closes the call, and the screen goes with it.
  const pressResolved = async () => {
    if (!emergency || resolvingHelp) return
    setResolvingHelp(true)
    try {
      upsertRequest(await resolveRequest(emergency.id))
      if (voice.mode === 'emergency') await voice.stop()
    } catch {
      setDialog({
        kind: 'error',
        title: t("That didn't go through"),
        body: t('Please try again.'),
      })
    } finally {
      setResolvingHelp(false)
    }
  }

  // The mic only starts when the patient taps it (Kurt: no listening on open).
  const openCategory = (next: Category) => setCategory(next)

  const closeCategory = () => {
    setCategory(null)
    if (voice.mode === 'request') void voice.stop()
  }

  // An option on a category screen: sent right away, then the "Request sent" card.
  const pressOption = async (option: PatientOption) => {
    if (sendingId) return
    setSendingId(option.id)
    if (voice.mode === 'request') void voice.stop()
    try {
      const request = await sendOption(roomId, option.id)
      upsertRequest(request)
      setCategory(null)
      setSentCard({ requests: [request], key: Date.now(), spoken: false })
    } catch {
      setDialog({
        kind: 'error',
        title: t("That didn't go through"),
        body: t('Please try again.'),
      })
    } finally {
      setSendingId(null)
    }
  }

  const act = async (id: string, action: 'cancel' | 'nudge') => {
    setBusyId(id)
    try {
      upsertRequest(await requestAction(id, action))
      return true
    } catch {
      setDialog({
        kind: 'error',
        title: t("That didn't go through"),
        body: t('Please try again.'),
      })
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
      if (sentCard.spoken) void voice.notifyAgent(REQUESTS_CANCELLED_RPC, { requestIds })
      setSentCard(null)
      if (results.some((r) => r.status === 'rejected')) {
        setDialog({
        kind: 'error',
        title: t("That didn't go through"),
        body: t('Please try again.'),
      })
      }
    } finally {
      setDeletingSent(false)
    }
  }

  const changeVoiceOnly = (on: boolean) => {
    setVoiceOnly(on)
    saveVoiceOnly(roomId, on)
    setCategory(null)
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

  const sentCardView = sentCard ? (
    <RequestSentCard
      className="flex-1"
      items={sentCard.requests.map((r) => ({
        id: r.id,
        label: patientLabel(r, t),
        icon: requestIcon(r),
      }))}
      listening={voice.mode === 'request'}
      seconds={SENT_CARD_SECONDS}
      resetKey={sentCard.key}
      onDone={() => setSentCard(null)}
      onDelete={() => void deleteSent()}
      deleting={deletingSent}
    />
  ) : null

  const helpLabel = helpButtonLabel(language)
  const room = t('Room {room}', { room: roomId })
  const greeting = patient.firstName ? t('Hi, {name}', { name: patient.firstName }) : room
  const where = patient.bed
    ? `${room} · ${t('Bed {bed}', { bed: patient.bed })}`
    : room

  return (
    <TextProvider value={t}>
    <div className="relative mx-auto flex h-dvh min-h-[768px] w-full max-w-[1024px] flex-col gap-4 overflow-hidden bg-bg px-7 pt-6 pb-7 text-ink">
      <AppHeader
        title={greeting}
        {...(patient.firstName ? { subtitle: where } : {})}
        languageLabel={languageName(language)}
        onLanguage={openLanguageScreen}
        voiceOnly={voiceOnly}
        onVoiceOnly={changeVoiceOnly}
        {...(voiceOnly
          ? {}
          : { onMyRequests: () => setRequestsOpen(true), requestCount: open.length })}
      />

      {voiceOnly ? (
        <main className="flex min-h-0 flex-1 gap-[18px]">
          {sentCardView ??
            (conversation.shown ? (
              <ConversationPanel
                className="flex-1"
                items={conversation.items}
                status={conversation.status}
                onPress={pressMic}
              />
            ) : (
              <RequestPanel className="flex-1" state={micState} onPress={pressMic} />
            ))}

          <div className="flex w-column shrink-0 flex-col gap-4">
            <HelpButton
              className="min-h-0 flex-1"
              label={helpLabel}
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
                  {t('My requests')}
                </h2>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setRequestsOpen(true)}
                  className="px-1 text-action-ink underline underline-offset-4"
                >
                  {open.length > 0 ? t('See all') : t('See past')}
                </Button>
              </div>
              {homeCards.length > 0 ? (
                <ul className="flex min-h-0 flex-1 flex-col gap-3">
                  {homeCards.map((request) => (
                    <li key={request.id} className="flex min-h-0 flex-1">
                      <RequestCard
                        className="h-full max-h-[140px]"
                        label={patientLabel(request, t)}
                        icon={requestIcon(request)}
                        status={request.status}
                        onPress={() => setRequestsOpen(true)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 rounded-md border-2 border-dashed border-border px-6">
                  <p className="font-heading text-heading leading-tight text-muted">
                    {t('Nothing right now')}
                  </p>
                  <p className="text-body text-muted">{t('Your requests will show here.')}</p>
                </div>
              )}
            </section>
          </div>
        </main>
      ) : (
        <div className="flex min-h-0 flex-1 gap-[18px]">
          <div className="flex w-[280px] shrink-0 flex-col gap-3.5">
            <HelpButton
              size="short"
              label={helpLabel}
              onPress={() => void pressHelp()}
              busy={helpBusy}
            />
            <MicTile
              className="flex-1"
              state={micState}
              onPress={pressMic}
              {...(category ? { listeningHint: t('Tap an option or speak your request') } : {})}
            />
          </div>

          <main className="flex min-w-0 flex-1 flex-col gap-3.5">
            {sentCard ? (
              <RequestSentPanel
                label={sentCard.requests.map((r) => patientLabel(r, t)).join(', ')}
                onOkay={() => setSentCard(null)}
                onCancel={() => void deleteSent()}
                cancelling={deletingSent}
              />
            ) : category ? (
                <CategoryView
                  category={category}
                  patient={patient}
                  listening={micState === 'listening'}
                  sendingId={sendingId}
                  onBack={closeCategory}
                  onOption={(option) => void pressOption(option)}
                  onSomethingElse={pressMic}
                />
              ) : (
                <>
                  {/* Same height as the emergency button, so the grid starts level with the mic tile. */}
                  <TitleRow className="h-tile shrink-0" title={t("What's it about?")} />
                  <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-4 gap-3">
                    {CATEGORIES.map((c) => (
                      <CategoryButton
                        key={c.id}
                        label={t(c.label)}
                        examples={t(c.examples)}
                        icon={c.icon}
                        onPress={() => openCategory(c)}
                      />
                    ))}
                  </div>
                </>
              )}
          </main>
        </div>
      )}

      <MyRequestsSheet
        open={requestsOpen}
        onOpenChange={setRequestsOpen}
        openItems={open.map((r) => toItem(r, now, t))}
        earlierItems={earlier.map((r) => toItem(r, now, t))}
        onNudge={(id) => void act(id, 'nudge')}
        onCancel={(id) => void act(id, 'cancel')}
        busyId={busyId}
      />

      <Dialog
        open={dialog?.kind === 'nurse'}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        tone="nurse"
        title={t('Your nurse has been told')}
        body={t(
          'They can see your call now. If you feel worse, press the red button on your bed rail.',
        )}
        actions={
          <DialogClose asChild>
            <Button variant="nurse" size="lg">
              {t('Okay')}
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
        body={t('You can change this any time with the Language button.')}
        actions={
          <>
            <DialogClose asChild>
              <Button variant="primary" size="lg">
                {t('Okay')}
              </Button>
            </DialogClose>
            {/* Back: stay on the language screen to pick another one. */}
            <Button variant="secondary" size="lg" onClick={() => setDialog(null)}>
              {t('Back')}
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
              {t('Okay')}
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
          onResolved={() => void pressResolved()}
          resolving={resolvingHelp}
        />
      ) : null}
    </div>
    </TextProvider>
  )
}

/** One category: back and title, the chart note or tags, the options, then Something else. */
function CategoryView({
  category,
  patient,
  listening,
  sendingId,
  onBack,
  onOption,
  onSomethingElse,
}: {
  category: Category
  patient: PatientInRoom
  listening: boolean
  sendingId: string | null
  onBack: () => void
  onOption: (option: PatientOption) => void
  onSomethingElse: () => void
}) {
  const t = useT()
  const screen = screenFor(category, patient.chart, t)
  // Few options: fixed-height rows from the top, not stretched over the screen.
  const few = screen.options.length < 4
  return (
    <>
      <TitleRow title={t(category.label)} onBack={onBack} />
      {screen.notice ? (
        <ChartNotice className="-mt-1" title={screen.notice.title} body={screen.notice.body} />
      ) : screen.tags ? (
        <ChartTags className="-mt-1" tags={screen.tags} />
      ) : listening ? null : (
        <p className="-mt-1 text-[19px] text-muted">{t('Tap one. Nothing is sent until you do.')}</p>
      )}
      <div
        className={
          few
            ? 'grid auto-rows-[112px] grid-cols-2 content-start gap-2.5'
            : 'grid min-h-0 flex-1 grid-cols-2 grid-rows-4 gap-2.5'
        }
      >
        {screen.options.map((option) => (
          <OptionTile
            key={option.id}
            label={t(option.label)}
            sub={t(option.sub)}
            disabled={sendingId !== null}
            onPress={() => onOption(option)}
          />
        ))}
        <SomethingElseTile onPress={onSomethingElse} />
      </div>
    </>
  )
}
