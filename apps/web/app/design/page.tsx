import { REQUEST_STATUSES } from '@bell/core/taxonomy'
import { ICON_NAMES, Icon, RoomButton, StatusPill } from '@bell/ui'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  ConfirmSheetDemo,
  ContrastRow,
  DesignShell,
  NurseButtonDemo,
  TalkButtonDemo,
  TileDemo,
  TokenValue,
  WaitTimerDemo,
} from './demos'

export const metadata: Metadata = { title: 'Design system' }

export default function DesignPage() {
  // The same showcase renders once per theme panel.
  return (
    <DesignShell>
      <Showcase />
    </DesignShell>
  )
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface ColorToken {
  name: string
  use: string
}

const COLOR_GROUPS: { title: string; tokens: ColorToken[] }[] = [
  {
    title: 'Surfaces',
    tokens: [
      { name: 'bg', use: 'Page background' },
      { name: 'surface', use: 'Cards, tiles, sheets' },
      { name: 'border', use: 'Hairlines' },
      { name: 'scrim', use: 'Behind sheets' },
    ],
  },
  {
    title: 'Text',
    tokens: [
      { name: 'ink', use: 'Main text' },
      { name: 'muted', use: 'Secondary text (also border-strong)' },
    ],
  },
  {
    title: 'Action',
    tokens: [
      { name: 'action', use: 'Primary button fill' },
      { name: 'action-strong', use: 'Strong accent' },
      { name: 'action-tint', use: 'Secondary fill, icon chips' },
      { name: 'action-ink', use: 'Icons and links' },
      { name: 'on-action', use: 'Text on action' },
    ],
  },
  {
    title: 'Nurse: nurse call and urgent only',
    tokens: [
      { name: 'nurse', use: 'Nurse button fill' },
      { name: 'nurse-tint', use: 'Nurse soft fill' },
      { name: 'nurse-ink', use: 'Text on nurse-tint' },
      { name: 'on-nurse', use: 'Text on nurse' },
    ],
  },
  {
    title: 'Request states',
    tokens: [
      { name: 'state-sent', use: 'Sent' },
      { name: 'state-sent-ink', use: 'Text on sent' },
      { name: 'state-seen', use: 'Seen' },
      { name: 'state-seen-ink', use: 'Text on seen' },
      { name: 'state-on-the-way', use: 'On the way' },
      { name: 'state-on-the-way-ink', use: 'Text on on-the-way' },
      { name: 'state-done', use: 'Done' },
      { name: 'state-done-ink', use: 'Text on done' },
    ],
  },
  {
    title: 'Focus',
    tokens: [{ name: 'focus', use: 'Focus outline' }],
  },
  {
    title: 'tokens-extra.css (not in the design system yet)',
    tokens: [
      { name: 'warn-tint', use: 'Long-wait fill' },
      { name: 'warn-ink', use: 'Long-wait text' },
    ],
  },
]

const CONTRAST_PAIRS: { fg: string; bg: string; use: string }[] = [
  { fg: '--ink', bg: '--bg', use: 'Body text' },
  { fg: '--ink', bg: '--surface', use: 'Text on cards' },
  { fg: '--muted', bg: '--surface', use: 'Secondary text' },
  { fg: '--on-action', bg: '--action', use: 'Primary button' },
  { fg: '--ink', bg: '--action-tint', use: 'Secondary button' },
  { fg: '--action-ink', bg: '--surface', use: 'Links and icons' },
  { fg: '--action-ink', bg: '--action-tint', use: 'Tile icon chips' },
  { fg: '--on-nurse', bg: '--nurse', use: 'Nurse button' },
  { fg: '--nurse-ink', bg: '--nurse-tint', use: 'Nurse called' },
  { fg: '--state-sent-ink', bg: '--state-sent', use: 'Sent pill' },
  { fg: '--state-seen-ink', bg: '--state-seen', use: 'Seen pill' },
  { fg: '--state-on-the-way-ink', bg: '--state-on-the-way', use: 'On the way pill' },
  { fg: '--state-done-ink', bg: '--state-done', use: 'Done pill' },
  { fg: '--warn-ink', bg: '--warn-tint', use: 'Long wait' },
  { fg: '--focus', bg: '--bg', use: 'Focus outline' },
]

// Full class names so Tailwind finds them.
const TYPE_SCALE = [
  { cls: 'text-caption', token: '--text-caption', use: 'Smallest allowed' },
  { cls: 'text-body', token: '--text-body', use: 'Body (text-base)' },
  { cls: 'text-lead', token: '--text-lead', use: 'Tile labels, buttons (text-lg)' },
  { cls: 'text-title', token: '--text-title', use: 'Big buttons (text-xl)' },
  { cls: 'text-heading', token: '--text-heading', use: 'Sheet titles (text-2xl)' },
  { cls: 'text-display', token: '--text-display', use: 'text-3xl' },
  { cls: 'text-display-lg', token: '--text-display-lg', use: 'text-4xl' },
  { cls: 'text-display-xl', token: '--text-display-xl', use: 'text-5xl' },
]

const RADII = [
  { cls: 'rounded-sm', token: '--radius-sm' },
  { cls: 'rounded-md', token: '--radius-md' },
  { cls: 'rounded-lg', token: '--radius-lg' },
  { cls: 'rounded-xl', token: '--radius-xl' },
  { cls: 'rounded-pill', token: '--radius-pill' },
  { cls: 'rounded-chip', token: '--chip-radius' },
]

const SIZES = [
  { cls: 'size-tap', token: '--size-tap', use: 'Minimum tap target' },
  { cls: 'size-tap-lg', token: '--size-tap-lg', use: 'Large buttons' },
  { cls: 'size-disc', token: '--size-disc', use: 'Talk button disc' },
  { cls: 'size-disc-lg', token: '--size-disc-lg', use: '' },
  { cls: 'size-disc-xl', token: '--size-disc-xl', use: '' },
  { cls: 'size-tile', token: '--size-tile', use: 'Tile minimum height' },
  { cls: 'size-main', token: '--size-main', use: '' },
]

const SPACES = [
  { cls: 'w-space-1', token: '--space-1' },
  { cls: 'w-space-2', token: '--space-2' },
  { cls: 'w-space-3', token: '--space-3' },
  { cls: 'w-space-4', token: '--space-4' },
  { cls: 'w-space-5', token: '--space-5' },
  { cls: 'w-space-6', token: '--space-6' },
  { cls: 'w-space-7', token: '--space-7' },
  { cls: 'w-space-8', token: '--space-8' },
  { cls: 'w-space-9', token: '--space-9' },
  { cls: 'w-space-10', token: '--space-10' },
]

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 border-border border-b pb-3">
        <h3 className="font-heading text-title [font-weight:var(--heading-weight)]">{title}</h3>
        {note ? <p className="text-caption text-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="font-mono text-caption text-muted">{label}</span>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Showcase (server-rendered; interactive pieces come from ./demos)
// ---------------------------------------------------------------------------

function Showcase() {
  return (
    <>
      <Section title="Color" note="Swatches read the live value of each variable in this panel.">
        <div className="flex flex-col gap-8">
          {COLOR_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <h4 className="font-bold">{group.title}</h4>
              <ul className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
                {group.tokens.map((token) => (
                  <li key={token.name} className="flex items-center gap-3">
                    <span
                      className="size-tap shrink-0 rounded-sm inset-ring-1 inset-ring-border"
                      style={{ background: `var(--${token.name})` }}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-bold">{token.name}</span>
                      <span className="text-caption text-muted">{token.use}</span>
                      <TokenValue name={`--${token.name}`} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Contrast" note="WCAG ratios computed live from this panel's tokens.">
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
          {CONTRAST_PAIRS.map((pair) => (
            <ContrastRow key={`${pair.fg}-${pair.bg}`} {...pair} />
          ))}
        </div>
      </Section>

      <Section title="Type" note="Body text is never below 20px; caption (18px) is the floor.">
        <div className="flex flex-col gap-2">
          <Labeled label="font-heading (weight: --heading-weight)">
            <p className="font-heading text-heading [font-weight:var(--heading-weight)]">
              Sent to your care aide
            </p>
          </Labeled>
          <Labeled label="font-heading (weight: --heading-weight-strong)">
            <p className="font-heading text-heading [font-weight:var(--heading-weight-strong)]">
              Sent to your care aide
            </p>
          </Labeled>
          <Labeled label="font-body">
            <p className="font-body text-body">
              Atkinson Hyperlegible: Il1 O0 rn m. Someone will come to your room soon.
            </p>
          </Labeled>
        </div>
        <ul className="flex flex-col gap-4">
          {TYPE_SCALE.map((t) => (
            <li key={t.cls} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <code className="font-mono text-caption text-muted">{t.cls}</code>
                <TokenValue name={t.token} />
                <span className="text-caption text-muted">{t.use}</span>
              </span>
              <span className={`${t.cls} font-bold`}>Water & food</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Shape and size">
        <div className="flex flex-col gap-3">
          <h4 className="font-bold">Radius</h4>
          <ul className="flex flex-wrap gap-4">
            {RADII.map((r) => (
              <li key={r.cls} className="flex flex-col items-start gap-2">
                <span
                  className={`h-tap w-28 bg-action-tint inset-ring-2 inset-ring-action-ink ${r.cls}`}
                />
                <code className="font-mono text-caption text-muted">{r.cls}</code>
                <TokenValue name={r.token} />
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="font-bold">Size</h4>
          <ul className="flex flex-wrap items-end gap-4">
            {SIZES.map((s) => (
              <li key={s.cls} className="flex flex-col items-start gap-2">
                <span className={`rounded-sm bg-surface inset-ring-2 inset-ring-muted ${s.cls}`} />
                <code className="font-mono text-caption text-muted">{s.cls}</code>
                <TokenValue name={s.token} />
                {s.use ? <span className="text-caption text-muted">{s.use}</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <h4 className="font-bold">Spacing (p-space-N, gap-space-N …)</h4>
          <ul className="flex flex-col gap-2">
            {SPACES.map((s) => (
              <li key={s.cls} className="flex items-center gap-3">
                <span className={`h-5 shrink-0 bg-action-ink ${s.cls}`} />
                <code className="w-28 font-mono text-caption text-muted">
                  {s.cls.replace('w-', '')}
                </code>
                <TokenValue name={s.token} />
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-8">
          <Labeled label="shadow-raised">
            <span className="block h-tap w-40 rounded-md bg-surface shadow-raised" />
          </Labeled>
          <Labeled label="focus outline (--focus-width, --focus-gap)">
            <span className="block h-tap w-40 rounded-sm bg-action outline-[length:var(--focus-width)] outline-focus outline-offset-[var(--focus-gap)] outline-solid" />
          </Labeled>
        </div>
      </Section>

      <Section
        title="NurseButton"
        note="Nurse colors are reserved for the nurse call. Every state shows a word."
      >
        <NurseButtonDemo />
      </Section>

      <Section
        title="TalkButton"
        note="Tap to talk (never hold). Looping animations stop with reduced motion."
      >
        <TalkButtonDemo />
      </Section>

      <Section
        title="RequestTile"
        note="The 8 request groups from @bell/core. Tap one to see the ConfirmSheet."
      >
        <TileDemo />
      </Section>

      <Section title="RoomButton" note="md is 64px tall, lg is 72px.">
        <div className="flex flex-col gap-6">
          {(['primary', 'secondary', 'ghost', 'nurse'] as const).map((variant) => (
            <div key={variant} className="flex flex-wrap items-end gap-4">
              <Labeled label={`variant="${variant}" size="md"`}>
                <RoomButton variant={variant}>
                  {variant === 'nurse' ? 'Call nurse' : 'Send'}
                </RoomButton>
              </Labeled>
              <Labeled label='size="lg"'>
                <RoomButton variant={variant} size="lg">
                  <Icon name={variant === 'nurse' ? 'nurse' : 'send'} />
                  {variant === 'nurse' ? 'Call nurse' : 'Send'}
                </RoomButton>
              </Labeled>
              <Labeled label="disabled">
                <RoomButton variant={variant} disabled>
                  {variant === 'nurse' ? 'Call nurse' : 'Send'}
                </RoomButton>
              </Labeled>
            </div>
          ))}
        </div>
      </Section>

      <Section title="StatusPill" note="Word plus four step dots; color only reinforces them.">
        <div className="flex flex-wrap gap-4">
          {REQUEST_STATUSES.map((status) => (
            <StatusPill key={status} status={status} />
          ))}
        </div>
      </Section>

      <Section
        title="ConfirmSheet"
        note="Says who the request went to and what happens next. Opens in this panel's theme."
      >
        <ConfirmSheetDemo />
      </Section>

      <Section
        title="WaitTimer"
        note="Amber from 10 minutes; from 20 it adds an alert icon and the word Overdue."
      >
        <WaitTimerDemo />
      </Section>

      <Section title="Icon" note="Stroke icons in currentColor, always aria-hidden.">
        <ul className="grid grid-cols-3 gap-4 @lg:grid-cols-5 @2xl:grid-cols-7">
          {ICON_NAMES.map((name) => (
            <li key={name} className="flex flex-col items-center gap-2 rounded-sm bg-surface p-3">
              <Icon name={name} className="size-8 text-action-ink" />
              <code className="font-mono text-caption text-muted">{name}</code>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
