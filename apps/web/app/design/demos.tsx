'use client'

import {
  isTheme,
  REQUEST_GROUPS,
  REQUEST_STATUSES,
  TEAM_LABELS,
  type Team,
  THEMES,
  type Theme,
} from '@bell/core/taxonomy'
import {
  ConfirmSheet,
  GROUP_ICON,
  Icon,
  NurseButton,
  type NurseButtonState,
  RequestTile,
  RoomButton,
  STATUS_PILL_LABELS,
  type StatusPillStatus,
  TalkButton,
  type TalkButtonState,
  WAIT_ALERT_MINUTES,
  WAIT_WARN_MINUTES,
  WaitTimer,
} from '@bell/ui'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'

const THEME_LABELS: Record<Theme, string> = { linen: 'Linen', clay: 'Clay', night: 'Night' }
const noop = () => {}

// ---------------------------------------------------------------------------
// Shell: theme picker + one panel per theme
// ---------------------------------------------------------------------------

/**
 * tokens.css scopes linen to `:root[data-theme="linen"]` while clay and night match any
 * element. So clay and night render as subtrees, and the linen panel only renders when
 * <html> itself is linen. The picker sets <html data-theme> and restores it on leave.
 */
export function DesignShell({ children }: { children: ReactNode }) {
  const [rootTheme, setRootTheme] = useState<Theme>('linen')

  useEffect(() => {
    const html = document.documentElement
    const previous = html.getAttribute('data-theme')
    if (isTheme(previous)) setRootTheme(previous)
    return () => {
      if (previous === null) html.removeAttribute('data-theme')
      else html.setAttribute('data-theme', previous)
    }
  }, [])

  const pick = (theme: Theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    setRootTheme(theme)
  }

  return (
    <div className="min-h-dvh bg-bg font-body text-body text-ink">
      <header className="flex flex-wrap items-end justify-between gap-6 border-border border-b px-6 py-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-display [font-weight:var(--heading-weight)]">
            Bell design system
          </h1>
          <p className="text-lead text-muted">
            Tokens and patient components in every theme. Values are read live from the CSS.
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-caption text-muted">
            Page theme (sets html data-theme)
          </legend>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((theme) => (
              <RoomButton
                key={theme}
                variant={theme === rootTheme ? 'primary' : 'secondary'}
                aria-pressed={theme === rootTheme}
                onClick={() => pick(theme)}
              >
                {THEME_LABELS[theme]}
              </RoomButton>
            ))}
          </div>
        </fieldset>
      </header>

      <div className="grid grid-cols-1 min-[1500px]:grid-cols-3">
        {THEMES.map((theme) =>
          theme === 'linen' && rootTheme !== 'linen' ? (
            <section
              key={theme}
              aria-label="Linen theme"
              className="flex flex-col items-start gap-4 border-border border-e px-6 py-10"
            >
              <h2 className="font-heading text-heading [font-weight:var(--heading-weight)]">
                Linen
              </h2>
              <p className="max-w-prose text-muted">
                Linen only applies on &lt;html&gt; (tokens.css uses
                :root[data-theme=&quot;linen&quot;]), so it can&apos;t be nested inside{' '}
                {THEME_LABELS[rootTheme]}. Switch the page to Linen to see all three side by side.
              </p>
              <RoomButton onClick={() => pick('linen')}>Show Linen</RoomButton>
            </section>
          ) : (
            // Portalled sheets mount here (no container-type on this element, so
            // position: fixed still uses the viewport).
            <section
              key={theme}
              data-theme={theme}
              aria-label={`${THEME_LABELS[theme]} theme`}
              className="bg-bg font-body text-body text-ink"
            >
              <div className="@container flex flex-col gap-14 px-6 py-10">
                <h2 className="font-heading text-heading [font-weight:var(--heading-weight)]">
                  {THEME_LABELS[theme]}
                  {theme === rootTheme ? (
                    <span className="ms-3 align-middle font-body text-caption text-muted">
                      page theme
                    </span>
                  ) : null}
                </h2>
                {children}
              </div>
            </section>
          ),
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live token readouts
// ---------------------------------------------------------------------------

function useComputedVar(ref: RefObject<HTMLElement | null>, name: string) {
  const [value, setValue] = useState('')
  useEffect(() => {
    if (ref.current) setValue(getComputedStyle(ref.current).getPropertyValue(name).trim())
  }, [ref, name])
  return value
}

/** The computed value of a CSS variable where this element sits (follows its theme). */
export function TokenValue({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const value = useComputedVar(ref, name)
  return (
    <span ref={ref} className="font-mono text-caption text-muted">
      {value || '…'}
    </span>
  )
}

let colorContext: CanvasRenderingContext2D | null = null

/** Any CSS color (named, #rgba, rgb(), ...) to [r, g, b] via the canvas normalizer. */
function parseColor(input: string): [number, number, number] | null {
  if (!input) return null
  colorContext ??= document.createElement('canvas').getContext('2d')
  let value = input
  if (colorContext) {
    colorContext.fillStyle = '#000'
    colorContext.fillStyle = input
    value = String(colorContext.fillStyle)
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ]
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value)?.[1]
  if (rgb) {
    const [r, g, b] = rgb
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    if (r !== undefined && g !== undefined && b !== undefined) return [r, g, b]
  }
  return null
}

function luminance([r, g, b]: [number, number, number]) {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Text color on background, with the live WCAG contrast ratio and a verdict in words. */
export function ContrastRow({ fg, bg, use }: { fg: string; bg: string; use: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const fgValue = useComputedVar(ref, fg)
  const bgValue = useComputedVar(ref, bg)
  const a = parseColor(fgValue)
  const b = parseColor(bgValue)
  let ratio: number | null = null
  if (a && b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
    ratio = (hi + 0.05) / (lo + 0.05)
  }
  const verdict =
    ratio === null
      ? '…'
      : ratio >= 4.5
        ? 'AA text'
        : ratio >= 3
          ? 'AA large text and icons only'
          : 'Below AA'

  return (
    <div ref={ref} className="flex items-center gap-4">
      <span
        className="flex size-tap shrink-0 items-center justify-center rounded-sm text-lead font-bold inset-ring-1 inset-ring-border"
        style={{ color: `var(${fg})`, background: `var(${bg})` }}
      >
        Aa
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-bold">
          {ratio === null ? '…' : `${ratio.toFixed(2)}:1`} · {verdict}
        </span>
        <span className="text-caption text-muted">
          {use}: <code>{fg}</code> on <code>{bg}</code>
        </span>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component demos
// ---------------------------------------------------------------------------

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="font-mono text-caption text-muted">{label}</span>
      {children}
    </div>
  )
}

/** Ref for the nearest [data-theme] element, so portalled sheets follow the panel's theme. */
function useThemeRoot() {
  const ref = useRef<HTMLDivElement>(null)
  const [root, setRoot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setRoot(ref.current?.closest<HTMLElement>('[data-theme]') ?? null)
  }, [])
  return [ref, root] as const
}

export function NurseButtonDemo() {
  const [state, setState] = useState<NurseButtonState>('idle')

  useEffect(() => {
    if (state !== 'sending') return
    const id = setTimeout(() => setState('sent'), 1200)
    return () => clearTimeout(id)
  }, [state])

  return (
    <div className="flex flex-col gap-6">
      <Labeled label="interactive (tap: sending, then sent; tap again to reset)">
        <NurseButton
          state={state}
          onPress={() => setState((s) => (s === 'sent' ? 'idle' : 'sending'))}
        />
      </Labeled>
      <div className="flex flex-wrap gap-6">
        {(['idle', 'sending', 'sent'] as const).map((s) => (
          <Labeled key={s} label={`state="${s}"`}>
            <NurseButton state={s} onPress={noop} />
          </Labeled>
        ))}
      </div>
    </div>
  )
}

const TALK_STATES: readonly TalkButtonState[] = [
  'idle',
  'connecting',
  'listening',
  'thinking',
  'speaking',
  'disabled',
]

const TALK_AUTO_NEXT: Partial<Record<TalkButtonState, [TalkButtonState, number]>> = {
  connecting: ['listening', 900],
  thinking: ['speaking', 1400],
  speaking: ['listening', 2400],
}

export function TalkButtonDemo() {
  const [state, setState] = useState<TalkButtonState>('idle')

  useEffect(() => {
    const next = TALK_AUTO_NEXT[state]
    if (!next) return
    const id = setTimeout(() => setState(next[0]), next[1])
    return () => clearTimeout(id)
  }, [state])

  const press = () =>
    setState((s) => (s === 'idle' ? 'connecting' : s === 'listening' ? 'thinking' : 'idle'))

  return (
    <div className="flex flex-col gap-6">
      <Labeled label="interactive (tap to start; tap while listening to send)">
        <TalkButton
          state={state}
          onPress={press}
          hint={state === 'listening' ? 'Tap when you’re done' : undefined}
        />
      </Labeled>
      <div className="flex flex-wrap gap-6">
        {TALK_STATES.map((s) => (
          <Labeled key={s} label={`state="${s}"`}>
            <TalkButton state={s} onPress={noop} disabledReason="Voice isn't set up yet" />
          </Labeled>
        ))}
      </div>
    </div>
  )
}

function sentToTitle(team: Team) {
  return team === 'nurse' || team === 'care_aide'
    ? `Sent to your ${TEAM_LABELS[team].toLowerCase()}`
    : `Sent to ${TEAM_LABELS[team]}`
}

export function TileDemo() {
  const [ref, root] = useThemeRoot()
  const [sent, setSent] = useState<{ title: string; label: string } | null>(null)

  return (
    <div ref={ref} className="flex flex-col gap-6">
      <ul className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
        {REQUEST_GROUPS.map((group) => (
          <li key={group.id} className="flex">
            <RequestTile
              label={group.label}
              hint={group.hint}
              icon={<Icon name={GROUP_ICON[group.id]} />}
              onPress={() => {
                const first = group.requests[0]
                if (first) setSent({ title: sentToTitle(first.team), label: first.label })
              }}
            />
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
        <Labeled label='tone="nurse"'>
          <RequestTile
            label="Something is beeping"
            icon={<Icon name="beeping" />}
            tone="nurse"
            onPress={noop}
          />
        </Labeled>
        <Labeled label="disabled">
          <RequestTile
            label="Water & food"
            hint="Sending…"
            icon={<Icon name="water" />}
            disabled
            onPress={noop}
          />
        </Labeled>
      </div>
      <ConfirmSheet
        open={sent !== null}
        onOpenChange={(open) => {
          if (!open) setSent(null)
        }}
        container={root}
        status="sent"
        title={sent?.title ?? ''}
        description={sent ? `You asked for: ${sent.label}` : undefined}
        nextStep="Someone will come to your room soon. You can keep using the tablet."
      />
    </div>
  )
}

export function ConfirmSheetDemo() {
  const [ref, root] = useThemeRoot()
  const [status, setStatus] = useState<StatusPillStatus | null>(null)

  return (
    <div ref={ref} className="flex flex-wrap gap-3">
      {REQUEST_STATUSES.map((s) => (
        <RoomButton key={s} variant="secondary" onClick={() => setStatus(s)}>
          Open: {STATUS_PILL_LABELS[s]}
        </RoomButton>
      ))}
      <ConfirmSheet
        open={status !== null}
        onOpenChange={(open) => {
          if (!open) setStatus(null)
        }}
        container={root}
        status={status ?? 'sent'}
        title="Sent to your care aide"
        description="You asked for: Water"
        nextStep="They'll bring it soon. You can keep using the tablet."
      />
    </div>
  )
}

export function WaitTimerDemo() {
  const [times] = useState(() => {
    const now = Date.now()
    return [4, WAIT_WARN_MINUTES + 2, WAIT_ALERT_MINUTES + 5].map(
      (minutes) => [minutes, new Date(now - minutes * 60_000)] as const,
    )
  })

  return (
    <div className="flex flex-wrap gap-8">
      {times.map(([minutes, since]) => (
        <Labeled key={minutes} label={`${minutes} min ago`}>
          <span className="text-lead">
            Waiting <WaitTimer since={since} className="font-bold" />
          </span>
        </Labeled>
      ))}
    </div>
  )
}
