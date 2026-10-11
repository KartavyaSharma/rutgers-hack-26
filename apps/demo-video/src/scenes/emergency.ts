import { s } from '../lib/time'
import { byText } from '../stage/tap'
import { BLANKET, PILLOW, WATER } from '../tablet/data'
import type { TabletState } from '../tablet/tablet-screen'
import type { SceneScript } from './scene-view'

// The red button: no conversation, someone is called straight away, and the screen stays up
// until the nurse who comes marks it resolved.

export const EMERGENCY_LENGTH = s(12.4)

const PRESS = s(1.6)
const LISTEN = s(2.3)
const RESOLVE = s(10)

export const emergencyScript: SceneScript = {
  stateAt: (frame): TabletState => ({
    language: 'auto',
    requests: [
      { ...WATER, status: 'on_the_way' },
      { ...PILLOW, status: 'seen' },
      { ...BLANKET, status: 'seen' },
    ],
    view: { mode: 'voice', main: { kind: 'panel', state: 'idle' } },
    ...(frame >= PRESS && frame < RESOLVE
      ? { emergency: frame >= LISTEN ? 'listening' : 'connecting' }
      : {}),
  }),
  cuts: [PRESS, RESOLVE],
  clocks: [PRESS],
  taps: [
    { at: PRESS - 4, find: byText('I have an emergency') },
    { at: RESOLVE - 4, find: byText('Resolved by staff') },
  ],
}

export const emergencyCaptions = [
  {
    // Starts once the previous scene's last caption has left (the scenes overlap by a crossfade).
    from: s(0.5),
    to: s(6),
    title: 'One button skips straight to help.',
    body: 'No conversation first: someone is called over right away, and the patient can say what’s happening while help is on the way.',
  },
  {
    from: s(6),
    to: EMERGENCY_LENGTH,
    title: 'It stays until staff close it.',
    body: 'The screen doesn’t go away on its own. The nurse who comes marks it resolved.',
  },
]
