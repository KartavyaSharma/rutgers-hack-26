import { helpButtonLabel } from '@bell/core/messages'
import {
  AppHeader,
  Button,
  CategoryButton,
  ChartNotice,
  type ConversationItem,
  ConversationPanel,
  EmergencyScreen,
  type EmergencyVoiceState,
  HelpButton,
  MicTile,
  OptionTile,
  RequestCard,
  RequestPanel,
  type RequestPanelState,
  RequestSentCard,
  RequestSentPanel,
  type SentCardItem,
  SomethingElseTile,
  STEP_LABELS,
  TextProvider,
  TitleRow,
  type VoiceStatus,
} from '@bell/ui'
import type { ReactNode } from 'react'
import {
  CATEGORIES,
  type DemoLanguage,
  type DemoRequest,
  FASTING_SCREEN,
  LANGUAGE_NAMES,
  PATIENT,
  translator,
} from './data'

export { SCREEN_HEIGHT, SCREEN_WIDTH } from '../stage/device'

/** What the big left card shows with Voice only on. */
export type VoiceMain =
  | { kind: 'panel'; state: RequestPanelState }
  | { kind: 'conversation'; items: ConversationItem[]; status: VoiceStatus }
  /** listening: the voice session is still open ("Still listening"). */
  | { kind: 'sent'; items: SentCardItem[]; listening: boolean }

/** What the right side shows with Voice only off. */
export type TouchMain =
  | { kind: 'categories' }
  /** The food screen while fasting (the chart's nothing-by-mouth order). */
  | { kind: 'fasting' }
  | { kind: 'sent'; label: string }

export interface TabletState {
  /** Whose tablet; Mei's unless given. */
  patient?: typeof PATIENT
  language: DemoLanguage
  requests: DemoRequest[]
  view: { mode: 'voice'; main: VoiceMain } | { mode: 'touch'; main: TouchMain }
  emergency?: EmergencyVoiceState
}

const noop = () => {}

/**
 * The patient tablet at 1024×768, laid out like apps/web/components/room/room-screen.tsx but
 * driven by a plain state object, so each frame of the video can say exactly what is on screen.
 * `children` draws on top (the tap indicator).
 */
export function TabletScreen({ state, children }: { state: TabletState; children?: ReactNode }) {
  const { language, requests, view } = state
  const t = translator(language)
  const patient = state.patient ?? PATIENT
  const room = t('Room {room}', { room: patient.room })
  const voiceOnly = view.mode === 'voice'
  const open = requests.filter((r) => r.status !== 'done' && r.status !== 'cancelled')

  return (
    <TextProvider value={t}>
      <div
        data-screen=""
        className="relative flex h-[768px] w-[1024px] flex-col gap-4 overflow-hidden bg-bg px-7 pt-6 pb-7 text-ink"
      >
        <AppHeader
          title={t('Hi, {name}', { name: patient.firstName })}
          subtitle={patient.bed ? `${room} · ${t('Bed {bed}', { bed: patient.bed })}` : room}
          languageLabel={LANGUAGE_NAMES[language]}
          onLanguage={noop}
          voiceOnly={voiceOnly}
          onVoiceOnly={noop}
          {...(voiceOnly ? {} : { onMyRequests: noop, requestCount: open.length })}
        />

        {view.mode === 'voice' ? (
          <main className="flex min-h-0 flex-1 gap-[18px]">
            <VoiceMainView main={view.main} />
            <div className="flex w-column shrink-0 flex-col gap-4">
              <HelpButton
                className="min-h-0 flex-1"
                label={helpButtonLabel(language)}
                onPress={noop}
              />
              <section className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex items-center justify-between px-1.5">
                  <h2 className="font-body text-body font-bold tracking-[0.06em] text-muted uppercase">
                    {t('My requests')}
                  </h2>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={noop}
                    className="px-1 text-action-ink underline underline-offset-4"
                  >
                    {open.length > 0 ? t('See all') : t('See past')}
                  </Button>
                </div>
                {open.length > 0 ? (
                  <ul className="flex min-h-0 flex-1 flex-col gap-3">
                    {open.slice(0, 2).map((request) => (
                      <li key={request.id} className="flex min-h-0 flex-1">
                        <RequestCard
                          className="h-full max-h-[140px]"
                          label={t(request.label)}
                          icon={request.icon}
                          status={request.status}
                          statusLabel={t(STEP_LABELS[request.status])}
                          onPress={noop}
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
              <HelpButton size="short" label={helpButtonLabel(language)} onPress={noop} />
              <MicTile className="flex-1" state="idle" onPress={noop} />
            </div>
            <main className="flex min-w-0 flex-1 flex-col gap-3.5">
              <TouchMainView main={view.main} />
            </main>
          </div>
        )}

        {state.emergency ? (
          <EmergencyScreen
            voice={state.emergency}
            onMistake={noop}
            onResolved={noop}
            autoFocus={false}
          />
        ) : null}

        {children}
      </div>
    </TextProvider>
  )
}

function VoiceMainView({ main }: { main: VoiceMain }) {
  switch (main.kind) {
    case 'panel':
      return <RequestPanel className="flex-1" state={main.state} onPress={noop} />
    case 'conversation':
      return (
        <ConversationPanel
          className="flex-1"
          items={main.items}
          status={main.status}
          onPress={noop}
        />
      )
    case 'sent':
      return (
        <RequestSentCard
          className="flex-1"
          items={main.items}
          listening={main.listening}
          seconds={10}
          onDone={noop}
          onDelete={noop}
        />
      )
  }
}

function TouchMainView({ main }: { main: TouchMain }) {
  switch (main.kind) {
    case 'categories':
      return (
        <>
          <TitleRow className="h-tile shrink-0" title="What's it about?" />
          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-4 gap-3">
            {CATEGORIES.map((c) => (
              <CategoryButton
                key={c.id}
                label={c.label}
                examples={c.examples}
                icon={c.icon}
                onPress={noop}
              />
            ))}
          </div>
        </>
      )
    case 'fasting':
      return (
        <>
          <TitleRow title={FASTING_SCREEN.label} onBack={noop} />
          <ChartNotice
            className="-mt-1"
            title={FASTING_SCREEN.notice.title}
            body={FASTING_SCREEN.notice.body}
          />
          {/* Few options: fixed-height rows from the top, as in the app. */}
          <div className="grid auto-rows-[112px] grid-cols-2 content-start gap-2.5">
            {FASTING_SCREEN.options.map((option) => (
              <OptionTile key={option.id} label={option.label} sub={option.sub} onPress={noop} />
            ))}
            <SomethingElseTile onPress={noop} />
          </div>
        </>
      )
    case 'sent':
      return <RequestSentPanel label={main.label} onOkay={noop} onCancel={noop} />
  }
}
