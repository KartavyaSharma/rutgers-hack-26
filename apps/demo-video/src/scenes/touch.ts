import { s } from '../lib/time'
import { byText } from '../stage/tap'
import { ADE } from '../tablet/data'
import type { TabletState, TouchMain } from '../tablet/tablet-screen'
import type { SceneScript } from './scene-view'

// Ade's tablet: Voice only (for patients who can't easily tap or see), then off for the category
// buttons, and a food menu that follows his chart (fasting for an MRI), one tap to send.

export const TOUCH_LENGTH = s(19)

const TOGGLE = s(5.2)
const FOOD = s(9.4)
const THIRSTY = s(15.2)

const main = (frame: number): TouchMain =>
  frame >= THIRSTY
    ? { kind: 'sent', label: 'I’m really thirsty' }
    : frame >= FOOD
      ? { kind: 'fasting' }
      : { kind: 'categories' }

export const touchScript: SceneScript = {
  stateAt: (frame): TabletState => ({
    patient: ADE,
    language: 'auto',
    requests:
      frame >= THIRSTY
        ? [{ id: 'thirsty', label: 'I’m really thirsty', icon: 'water', status: 'sent' }]
        : [],
    view:
      frame < TOGGLE
        ? { mode: 'voice', main: { kind: 'panel', state: 'idle' } }
        : { mode: 'touch', main: main(frame) },
  }),
  cuts: [TOGGLE, FOOD, THIRSTY],
  clocks: [],
  taps: [
    { at: TOGGLE - 4, find: (screen) => screen.querySelector('[role="switch"]') },
    { at: FOOD - 4, find: byText('Food and drink') },
    { at: THIRSTY - 4, find: byText('really thirsty') },
  ],
}

export const touchCaptions = [
  {
    // Starts once the previous scene's last caption has left (the scenes overlap by a crossfade).
    from: s(0.5),
    to: TOGGLE - s(0.2),
    title: 'Voice only, for those who need it.',
    body: 'Every request works by voice for patients with limited mobility or vision. Their nurse makes sure it’s on.',
  },
  {
    from: TOGGLE - s(0.2),
    to: FOOD - s(0.2),
    title: 'Prefer to tap? Turn it off.',
    body: 'Common requests sit in simple categories, and patients who can’t speak can type the details.',
  },
  {
    from: FOOD - s(0.2),
    to: THIRSTY - s(0.2),
    title: 'Menus that follow the chart.',
    body: 'Fasting before a scan? Food gives way to safe options, with the reason right there.',
  },
  {
    from: THIRSTY - s(0.2),
    to: TOUCH_LENGTH,
    title: 'One tap. Sent.',
    body: 'It goes straight to the right person, with the chart in mind.',
  },
]
