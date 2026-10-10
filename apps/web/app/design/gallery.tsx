'use client'

import { isLanguagePreference } from '@bell/core/taxonomy'
import {
  AppHeader,
  type BlindsPosition,
  Button,
  type ButtonSize,
  type ButtonVariant,
  type ConversationItem,
  ConversationPanel,
  Dialog,
  DialogClose,
  EmergencyScreen,
  type EmergencyVoiceState,
  HelpButton,
  ICON_NAMES,
  Icon,
  LanguagePicker,
  type MyRequestItem,
  MyRequestsSheet,
  RequestCard,
  RequestPanel,
  type RequestPanelState,
  RequestSentCard,
  RoomControls,
  type SentCardItem,
  Sheet,
  STEP_LABELS,
  type StepStatus,
  StepTrack,
  type VoiceStatus,
  VoiceStatusBar,
} from '@bell/ui'
import { type ReactNode, useState } from 'react'
import {
  allSetTitle,
  CHOOSE_LANGUAGE_SUBTITLE,
  continueLabel,
  LANGUAGE_OPTIONS,
  languageDir,
  MOST_USED_OPTIONS,
} from '@/lib/client/patient-text'

const THEMES = [
  { id: 'clay', name: 'Clay', note: 'The tablet theme' },
  { id: 'night', name: 'Night', note: 'Kept for later (night-time); not on the tablet yet' },
] as const

const COLOR_TOKENS = [
  'bg',
  'surface',
  'ink',
  'muted',
  'border',
  'action',
  'action-tint',
  'action-ink',
  'on-action',
  'nurse',
  'nurse-tint',
  'nurse-ink',
  'on-nurse',
] as const

const TYPE_SCALE = [
  ['hero', 'text-hero'],
  ['display-xl', 'text-display-xl'],
  ['display-lg', 'text-display-lg'],
  ['display', 'text-display'],
  ['heading', 'text-heading'],
  ['title', 'text-title'],
  ['lead', 'text-lead'],
  ['body', 'text-body'],
] as const

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'nurse']
const SIZES: ButtonSize[] = ['md', 'lg', 'xl']
const PANEL_STATES: RequestPanelState[] = ['idle', 'connecting', 'listening', 'unavailable']
const STATUSES: StepStatus[] = ['sent', 'seen', 'on_the_way', 'done', 'cancelled']
const EMERGENCY_STATES: EmergencyVoiceState[] = ['listening', 'connecting', 'idle', 'off']

const SAMPLE_CONVERSATION: ConversationItem[] = [
  {
    kind: 'message',
    id: 'a1',
    from: 'agent',
    text: 'Hi, I’m Bell. What do you need?',
  },
  {
    kind: 'message',
    id: 'p1',
    from: 'patient',
    text: 'Could someone clean up a spill, and can I have some water?',
  },
  {
    kind: 'message',
    id: 'a2',
    from: 'agent',
    text: 'Sending someone to clean up the spill, and some water. Anything else?',
    actions: [
      { id: 'c1', kind: 'sent', label: 'Clean up a spill', icon: 'cleaning' },
      { id: 'c2', kind: 'sent', label: 'Some water', icon: 'water' },
    ],
  },
  { kind: 'message', id: 'p2', from: 'patient', text: 'Actually, no water.' },
  {
    kind: 'message',
    id: 'a3',
    from: 'agent',
    text: 'Okay, I cancelled the water.',
    actions: [{ id: 'c3', kind: 'cancelled', label: 'Some water', icon: 'water' }],
  },
  { kind: 'message', id: 'p3', from: 'patient', text: 'My chest feels tight', live: true },
]

const SAMPLE_NURSE_ROW: ConversationItem[] = [
  { kind: 'message', id: 'p1', from: 'patient', text: 'I need my nurse, my IV hurts.' },
  { kind: 'actions', id: 'row', actions: [{ id: 'n1', kind: 'nurse' }] },
]

const VOICE_STATUSES: VoiceStatus[] = ['connecting', 'listening', 'thinking', 'speaking', 'ended']

const SAMPLE_OPEN: MyRequestItem[] = [
  {
    id: 'a',
    label: 'An extra blanket',
    icon: 'comfort',
    status: 'on_the_way',
    line: 'Someone is on the way',
    when: '12 min ago',
  },
  {
    id: 'b',
    label: 'Clean up a spill',
    icon: 'cleaning',
    status: 'seen',
    line: 'Seen by your care team',
    when: '25 min ago',
    nudged: true,
  },
]

const SAMPLE_EARLIER: MyRequestItem[] = [
  { id: 'c', label: 'Water', icon: 'water', status: 'done', line: 'Done', when: '2 hours ago' },
  {
    id: 'd',
    label: 'The TV',
    icon: 'fix',
    status: 'cancelled',
    line: 'Cancelled',
    when: '3 hours ago',
  },
]

export function DesignGallery() {
  return (
    <div className="flex flex-col">
      {THEMES.map((theme) => (
        <ThemePanel key={theme.id} theme={theme} />
      ))}
    </div>
  )
}

function ThemePanel({ theme }: { theme: (typeof THEMES)[number] }) {
  // Overlays portal into this panel so they take its theme.
  const [container, setContainer] = useState<HTMLElement | null>(null)
  return (
    <section
      ref={setContainer}
      data-theme={theme.id}
      aria-labelledby={`theme-${theme.id}`}
      className="flex flex-col gap-12 bg-bg px-8 py-12 text-ink"
    >
      <header className="flex flex-col gap-1">
        <h1 id={`theme-${theme.id}`} className="text-display-xl">
          {theme.name}
        </h1>
        <p className="text-lead text-muted">{theme.note}</p>
      </header>

      <Block title="Colors" note="Tokens from tokens.css, by role">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {COLOR_TOKENS.map((token) => (
            <div key={token} className="flex flex-col gap-2">
              <span
                className="h-16 rounded-md border-2 border-border"
                style={{ background: `var(--color-${token})` }}
              />
              <code className="text-body">{token}</code>
            </div>
          ))}
        </div>
      </Block>

      <Block
        title="Type"
        note="One family: headings in Atkinson Hyperlegible Bold at -0.01em, everything else in Atkinson Hyperlegible"
      >
        <div className="flex flex-col gap-3">
          {TYPE_SCALE.map(([name, cls]) => (
            <p
              key={name}
              className={`${cls} ${name === 'hero' || name.startsWith('display') || name === 'heading' ? 'font-heading' : 'font-body'}`}
            >
              {name}: Make a request
            </p>
          ))}
        </div>
      </Block>

      <Block title="Button" note="Pill buttons; md is the 64px minimum">
        <div className="flex flex-col gap-4">
          {VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              {SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {variant} {size}
                </Button>
              ))}
              <Button variant={variant} icon="check">
                With icon
              </Button>
              <Button variant={variant} disabled>
                Disabled
              </Button>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Icon" note="GROUP_ICON maps each request group to one of these">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {ICON_NAMES.map((name) => (
            <li key={name} className="flex items-center gap-3 rounded-md bg-surface p-3">
              <Icon name={name} className="size-8 text-action-ink" />
              <code className="text-body">{name}</code>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="AppHeader">
        <div className="rounded-lg border-2 border-dashed border-border p-4">
          <AppHeader
            title="Room 412"
            subtitle="Tap to request help"
            languageLabel="English"
            onLanguage={() => {}}
            roomStatus="70° · Lights 60%"
            onRoom={() => {}}
          />
        </div>
      </Block>

      <Block
        title="ConversationPanel"
        note="While talking: the live transcript as bubbles (you on the right, Bell on the left), what Bell did as chips, and the mic status where a chat app has its message box"
      >
        <div className="grid grid-cols-2 gap-4">
          <ConversationPanel
            items={SAMPLE_CONVERSATION}
            status="listening"
            onPress={() => {}}
            className="h-[620px]"
          />
          <div className="flex flex-col gap-4">
            <ConversationPanel
              items={SAMPLE_NURSE_ROW}
              status="thinking"
              onPress={() => {}}
              className="h-[300px]"
            />
            <ConversationPanel
              items={[]}
              status="connecting"
              onPress={() => {}}
              className="h-[300px]"
            />
          </div>
        </div>
        <div className="flex max-w-[600px] flex-col gap-3">
          {VOICE_STATUSES.map((status) => (
            <VoiceStatusBar key={status} status={status} onPress={() => {}} />
          ))}
        </div>
      </Block>

      <Block
        title="RequestSentCard"
        note="In the Make a request panel after a spoken request: the edge drains over 10 s, then it closes as if Looks good was tapped"
      >
        <div className="grid grid-cols-3 gap-4">
          {SENT_CARDS.map((card) => (
            <SentCardDemo key={card.note} card={card} />
          ))}
        </div>
      </Block>

      <Block title="RequestPanel" note="idle, connecting, listening, unavailable (no voice keys)">
        <div className="grid grid-cols-2 gap-4">
          {PANEL_STATES.map((state) => (
            <RequestPanel key={state} state={state} onPress={() => {}} className="h-[460px]" />
          ))}
        </div>
      </Block>

      <Block title="HelpButton" note="idle and sending">
        <div className="grid grid-cols-2 gap-4">
          <HelpButton onPress={() => {}} className="h-[300px]" />
          <HelpButton onPress={() => {}} busy className="h-[300px]" />
        </div>
      </Block>

      <Block title="RequestCard" note="One per open request on the home screen">
        <div className="grid max-w-[390px] gap-3">
          {STATUSES.filter((s) => s !== 'cancelled').map((status) => (
            <RequestCard
              key={status}
              label="An extra blanket"
              icon="comfort"
              status={status}
              onPress={() => {}}
            />
          ))}
          <RequestCard label="Help" icon="alert" status="sent" onPress={() => {}} />
        </div>
      </Block>

      <Block title="StepTrack" note="Sent · Seen · On the way · Done, and Cancelled">
        <div className="flex max-w-[760px] flex-col gap-5 rounded-lg bg-surface p-6">
          {STATUSES.map((status) => (
            <div key={status} className="flex flex-col gap-2">
              <code className="text-body text-muted">{STEP_LABELS[status]}</code>
              <StepTrack status={status} />
            </div>
          ))}
        </div>
      </Block>

      <Block title="Dialog and Sheet" note="Open each one; they take this panel's theme">
        <OverlayDemos container={container} />
      </Block>

      <Block title="RoomControls" note="Stepper (Lights, Temperature) and ToggleTile (Blinds, TV)">
        <RoomControlsDemo />
      </Block>

      <Block
        title="LanguagePicker"
        note="First run and the Language button: search, Most used, then A to Z (shown in a 1024×768 frame)"
      >
        <Frame>
          <PickerDemo />
        </Frame>
      </Block>

      <Block
        title="EmergencyScreen"
        note="Full screen after I need help immediately; no back button"
      >
        <EmergencyDemo />
      </Block>
    </section>
  )
}

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-b-2 border-border pb-2">
        <h2 className="text-display">{title}</h2>
        {note ? <p className="text-body text-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** A 1024×768 tablet frame for full-screen components. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-[768px] w-[1024px] max-w-full overflow-hidden rounded-lg border-2 border-border bg-bg">
      {children}
    </div>
  )
}

const SENT_CARDS: { note: string; listening: boolean; items: SentCardItem[] }[] = [
  {
    note: 'One request, still listening',
    listening: true,
    items: [{ id: '1', label: 'Extra pillow', icon: 'comfort' }],
  },
  {
    note: 'Two from one sentence',
    listening: true,
    items: [
      { id: '1', label: 'Clean up a spill', icon: 'cleaning' },
      { id: '2', label: 'Some water', icon: 'water' },
    ],
  },
  {
    note: 'Three, after the session ended',
    listening: false,
    items: [
      { id: '1', label: 'Clean up a spill', icon: 'cleaning' },
      { id: '2', label: 'Some water', icon: 'water' },
      { id: '3', label: 'Help sitting up', icon: 'move' },
    ],
  },
]

/** The Request sent card restarts its 10 s timer whenever "Replay" is pressed. */
function SentCardDemo({ card }: { card: (typeof SENT_CARDS)[number] }) {
  const [key, setKey] = useState(0)
  const [closed, setClosed] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body text-muted">{card.note}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setClosed(false)
            setKey((k) => k + 1)
          }}
        >
          Replay
        </Button>
      </div>
      <div className="h-[600px]">
        {closed ? (
          <p className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-border text-lead text-muted">
            Closed (Looks good, Delete, or the timer ran out)
          </p>
        ) : (
          <RequestSentCard
            className="h-full"
            items={card.items}
            listening={card.listening}
            resetKey={key}
            onDone={() => setClosed(true)}
            onDelete={() => setClosed(true)}
          />
        )}
      </div>
    </div>
  )
}

function OverlayDemos({ container }: { container: HTMLElement | null }) {
  const [open, setOpen] = useState<
    'nurse' | 'all-set' | 'room' | 'requests' | 'requests-empty' | null
  >(null)
  const close = (isOpen: boolean) => {
    if (!isOpen) setOpen(null)
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => setOpen('nurse')}>
        Your nurse has been told
      </Button>
      <Button variant="secondary" onClick={() => setOpen('all-set')}>
        You're all set
      </Button>
      <Button variant="secondary" onClick={() => setOpen('room')}>
        Your room sheet
      </Button>
      <Button variant="secondary" onClick={() => setOpen('requests')}>
        My requests
      </Button>
      <Button variant="secondary" onClick={() => setOpen('requests-empty')}>
        My requests, empty
      </Button>

      <Dialog
        open={open === 'nurse'}
        onOpenChange={close}
        container={container}
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
        open={open === 'all-set'}
        onOpenChange={close}
        container={container}
        title={allSetTitle('es')}
        body="You can change this any time with the Language button."
        actions={
          <>
            <DialogClose asChild>
              <Button size="lg">Okay</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="secondary" size="lg">
                Back
              </Button>
            </DialogClose>
          </>
        }
      />
      <Sheet open={open === 'room'} onOpenChange={close} container={container} title="Your room">
        <RoomControlsDemo />
      </Sheet>
      <MyRequestsSheet
        open={open === 'requests' || open === 'requests-empty'}
        onOpenChange={close}
        container={container}
        openItems={open === 'requests' ? SAMPLE_OPEN : []}
        earlierItems={open === 'requests' ? SAMPLE_EARLIER : []}
        onNudge={() => {}}
        onCancel={() => {}}
      />
    </div>
  )
}

function RoomControlsDemo() {
  const [lights, setLights] = useState(60)
  const [temperatureF, setTemperatureF] = useState(70)
  const [blinds, setBlinds] = useState<BlindsPosition>('open')
  const [tvOn, setTvOn] = useState(false)
  return (
    <RoomControls
      lights={lights}
      temperatureF={temperatureF}
      blinds={blinds}
      tvOn={tvOn}
      onLights={setLights}
      onTemperature={setTemperatureF}
      onBlinds={setBlinds}
      onTv={setTvOn}
    />
  )
}

function PickerDemo() {
  const [value, setValue] = useState('es')
  const language = isLanguagePreference(value) ? value : 'auto'
  return (
    <LanguagePicker
      options={LANGUAGE_OPTIONS}
      mostUsed={MOST_USED_OPTIONS}
      value={value}
      onChange={setValue}
      onContinue={() => {}}
      continueLabel={continueLabel(language)}
      continueDir={languageDir(language)}
      subtitle={CHOOSE_LANGUAGE_SUBTITLE}
    />
  )
}

function EmergencyDemo() {
  const [voice, setVoice] = useState<EmergencyVoiceState>('listening')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {EMERGENCY_STATES.map((state) => (
          <Button
            key={state}
            variant={state === voice ? 'primary' : 'secondary'}
            aria-pressed={state === voice}
            onClick={() => setVoice(state)}
          >
            Voice: {state}
          </Button>
        ))}
      </div>
      <Frame>
        <EmergencyScreen
          voice={voice}
          autoFocus={false}
          onTalk={() => setVoice('connecting')}
          onMistake={() => {}}
        />
      </Frame>
    </div>
  )
}
