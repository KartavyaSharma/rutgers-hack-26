'use client'

import { helpButtonLabel } from '@bell/core/messages'
import {
  type CallRequest,
  isLanguagePreference,
  isOpenStatus,
  type LanguagePreference,
  type StreamEvent,
} from '@bell/core/taxonomy'
import {
  AppHeader,
  Button,
  Dialog,
  DialogClose,
  EmergencyScreen,
  type EmergencyVoiceState,
  HelpButton,
  LanguageOptions,
  LanguagePicker,
  type MyRequestItem,
  MyRequestsSheet,
  RequestCard,
  RequestPanel,
  type RequestPanelState,
  RoomControls,
  Sheet,
} from '@bell/ui'
import { useEffect, useState } from 'react'
import { callForHelp, requestAction } from '@/lib/client/api'
import {
  CHOOSE_LANGUAGE_SUBTITLE,
  continueLabel,
  LANGUAGE_OPTIONS,
  languageName,
  patientLabel,
  requestIcon,
  statusLine,
  timeAgo,
  wentStraightToNurse,
} from '@/lib/client/patient-text'
import { isFirstRun, loadRoomSettings, saveRoomLanguage } from '@/lib/client/room-settings'
import { useLiveFeed } from '@/lib/client/use-live-feed'
import { useRoomControls } from './use-room-controls'
import { useVoiceSession } from './use-voice-session'

const HOME_CARDS = 2
const FEED_LIMIT = 100
const TICK_MS = 30_000

type SheetName = 'language' | 'room' | 'requests'

type DialogState =
  | { kind: 'sent'; request: CallRequest }
  | { kind: 'nurse' }
  | { kind: 'error'; title: string; body?: string }

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
  const [firstRun, setFirstRun] = useState(false)
  const [pickerValue, setPickerValue] = useState<LanguagePreference>('auto')
  const [sheet, setSheet] = useState<SheetName | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [helpBusy, setHelpBusy] = useState(false)
  const [cancellingHelp, setCancellingHelp] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const settings = loadRoomSettings(roomId)
    setLanguage(settings.language)
    setPickerValue(settings.language)
    setFirstRun(isFirstRun(roomId))
  }, [roomId])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const voice = useVoiceSession({ roomId, language, enabled: voiceEnabled })
  const room = useRoomControls(roomId)

  // A spoken request was classified and sent: say where it stands.
  const onEvent = (event: StreamEvent) => {
    const request = event.request
    if (event.type !== 'request.created' || request.source !== 'voice') return
    setSheet(null)
    setDialog(wentStraightToNurse(request) ? { kind: 'nurse' } : { kind: 'sent', request })
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

  // Change: cancel it, then start talking to say what is needed instead.
  const changeRequest = async (id: string) => {
    if (!(await act(id, 'cancel'))) return
    setSheet(null)
    if (voice.mode !== 'request') void voice.start({ mode: 'request' })
  }

  const chooseLanguage = (value: string) => {
    if (!isLanguagePreference(value)) return
    setLanguage(value)
    saveRoomLanguage(roomId, value)
    setSheet(null)
  }

  const finishFirstRun = () => {
    setLanguage(pickerValue)
    saveRoomLanguage(roomId, pickerValue)
    setFirstRun(false)
  }

  const controls = room.controls
  const roomStatus = controls ? `${controls.temperatureF}° · Lights ${controls.lights}%` : undefined

  return (
    <div className="relative mx-auto flex h-dvh min-h-[768px] w-full max-w-[1024px] flex-col gap-[18px] overflow-hidden bg-bg px-7 pt-[26px] pb-7 text-ink">
      <AppHeader
        title={`Room ${roomId}`}
        subtitle="Tap to request help"
        languageLabel={languageName(language)}
        onLanguage={() => setSheet('language')}
        {...(roomStatus ? { roomStatus } : {})}
        onRoom={() => {
          setSheet('room')
          void room.refresh()
        }}
      />

      <main className="flex min-h-0 flex-1 gap-[18px]">
        <RequestPanel className="flex-1" state={panelState} onPress={pressPanel} />

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
            {open.length > 0 ? (
              <ul className="flex min-h-0 flex-1 flex-col gap-3">
                {open.slice(0, HOME_CARDS).map((request) => (
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
        open={sheet === 'language'}
        onOpenChange={(isOpen) => setSheet(isOpen ? 'language' : null)}
        title="Language"
      >
        <LanguageOptions
          options={LANGUAGE_OPTIONS}
          value={language}
          onChange={chooseLanguage}
          columns={3}
        />
      </Sheet>

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
        onChange={(id) => void changeRequest(id)}
        onCancel={(id) => void act(id, 'cancel')}
        canChange={voice.available}
        busyId={busyId}
      />

      <Dialog
        open={dialog?.kind === 'sent'}
        onOpenChange={(isOpen) => !isOpen && setDialog(null)}
        {...(dialog?.kind === 'sent' && dialog.request.text
          ? { eyebrow: `You said “${dialog.request.text}”` }
          : {})}
        title={dialog?.kind === 'sent' ? patientLabel(dialog.request) : ''}
        status="Request sent"
        body="Someone will be with you soon. You don't need to ask again."
        actions={
          <>
            <DialogClose asChild>
              <Button variant="primary" size="lg">
                Okay
              </Button>
            </DialogClose>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setDialog(null)
                setSheet('requests')
              }}
            >
              Follow it
            </Button>
          </>
        }
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

      {firstRun ? (
        <LanguagePicker
          options={LANGUAGE_OPTIONS}
          value={pickerValue}
          onChange={(value) => {
            if (isLanguagePreference(value)) setPickerValue(value)
          }}
          onContinue={finishFirstRun}
          continueLabel={continueLabel(pickerValue)}
          subtitle={CHOOSE_LANGUAGE_SUBTITLE}
        />
      ) : null}

      {emergency ? (
        <EmergencyScreen
          className="z-40"
          voice={emergencyVoice}
          onTalk={talkInEmergency}
          onMistake={() => void pressMistake()}
          cancelling={cancellingHelp}
        />
      ) : null}
    </div>
  )
}
