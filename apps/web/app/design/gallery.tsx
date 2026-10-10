'use client'

import {
  AppHeader,
  type BlindsPosition,
  Button,
  type ButtonSize,
  type ButtonVariant,
  Dialog,
  DialogClose,
  EmergencyScreen,
  type EmergencyVoiceState,
  HelpButton,
  ICON_NAMES,
  Icon,
  LanguageOptions,
  LanguagePicker,
  type MyRequestItem,
  MyRequestsSheet,
  RequestCard,
  RequestPanel,
  type RequestPanelState,
  RoomControls,
  Sheet,
  STEP_LABELS,
  type StepStatus,
  StepTrack,
} from '@bell/ui'
import { type ReactNode, useState } from 'react'
import { LANGUAGE_OPTIONS } from '@/lib/client/patient-text'

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
        note="Headings in the theme's serif, everything else in Atkinson Hyperlegible"
      >
        <div className="flex flex-col gap-3">
          {TYPE_SCALE.map(([name, cls]) => (
            <p
              key={name}
              className={`${cls} ${name.startsWith('display') || name === 'heading' ? 'font-heading' : 'font-body'}`}
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

      <Block title="LanguageOptions" note="The Language sheet's grid">
        <LanguageDemo />
      </Block>

      <Block title="LanguagePicker" note="First run, full screen (shown in a 1024×768 frame)">
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

function OverlayDemos({ container }: { container: HTMLElement | null }) {
  const [open, setOpen] = useState<
    'sent' | 'nurse' | 'language' | 'room' | 'requests' | 'requests-empty' | null
  >(null)
  const [language, setLanguage] = useState('en')
  const close = (isOpen: boolean) => {
    if (!isOpen) setOpen(null)
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => setOpen('sent')}>
        Request sent
      </Button>
      <Button variant="secondary" onClick={() => setOpen('nurse')}>
        Your nurse has been told
      </Button>
      <Button variant="secondary" onClick={() => setOpen('language')}>
        Language sheet
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
        open={open === 'sent'}
        onOpenChange={close}
        container={container}
        eyebrow="You said “Can I get another pillow please”"
        title="Another pillow"
        status="Request sent"
        body="Someone will be with you soon. You don't need to ask again."
        actions={
          <>
            <DialogClose asChild>
              <Button size="lg">Okay</Button>
            </DialogClose>
            <Button variant="secondary" size="lg" onClick={() => setOpen('requests')}>
              Follow it
            </Button>
          </>
        }
      />
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
      <Sheet open={open === 'language'} onOpenChange={close} container={container} title="Language">
        <LanguageOptions
          options={LANGUAGE_OPTIONS}
          value={language}
          onChange={setLanguage}
          columns={3}
        />
      </Sheet>
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
        onChange={() => {}}
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

function LanguageDemo() {
  const [value, setValue] = useState('auto')
  return (
    <div className="max-w-[860px]">
      <LanguageOptions options={LANGUAGE_OPTIONS} value={value} onChange={setValue} columns={3} />
    </div>
  )
}

function PickerDemo() {
  const [value, setValue] = useState('es')
  return (
    <LanguagePicker
      options={LANGUAGE_OPTIONS}
      value={value}
      onChange={setValue}
      onContinue={() => {}}
      continueLabel={value === 'es' ? 'Continuar' : 'Continue'}
      subtitle="Elija su idioma · Choisissez votre langue · अपनी भाषा चुनें · 言語を選んでください"
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
