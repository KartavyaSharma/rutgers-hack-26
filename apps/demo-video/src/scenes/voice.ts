import type { VoiceStatus } from '@bell/ui'
import { s, stepAt } from '../lib/time'
import { byText } from '../stage/tap'
import {
  BLANKET,
  type DemoLanguage,
  type DemoRequest,
  PILLOW,
  translator,
  WATER,
} from '../tablet/data'
import type { TabletState, VoiceMain } from '../tablet/tablet-screen'
import { conversationAt, type Line, lineEnd, type SceneScript } from './scene-view'

// "Hey Bell", a request in English, a switch to Chinese mid-conversation (the screen follows),
// "that's all", and the tablet settling back to waiting while the requests move along.

export const VOICE_LENGTH = s(35)

const zh = translator('zh')

const askEnglish: Line = {
  id: 'ask-en',
  from: 'patient',
  text: "Could I get some water? And I'm a little cold.",
  start: s(6.5),
  pace: 6,
}
const replyEnglish: Line = {
  id: 'reply-en',
  from: 'agent',
  text: "Of course. I've asked for water and a warm blanket.",
  start: s(9.6),
  pace: 3,
  actions: [
    { id: 'a-water', kind: 'sent', label: 'Water', icon: WATER.icon },
    { id: 'a-blanket', kind: 'sent', label: 'Blanket', icon: BLANKET.icon },
  ],
  actionsAt: s(10.9),
}
const askChinese: Line = {
  id: 'ask-zh',
  from: 'patient',
  text: '还有，能再给我一个枕头吗？',
  start: s(16.4),
  pace: 4,
}
const replyChinese: Line = {
  id: 'reply-zh',
  from: 'agent',
  text: '好的，已经帮您再要一个枕头。',
  start: s(19.2),
  pace: 2,
  actions: [{ id: 'a-pillow', kind: 'sent', label: 'Pillow', icon: PILLOW.icon }],
  actionsAt: s(20.3),
}
const doneChinese: Line = {
  id: 'done-zh',
  from: 'patient',
  text: '就这些，谢谢。',
  start: s(24.8),
  pace: 4,
}
const byeChinese: Line = {
  id: 'bye-zh',
  from: 'agent',
  text: '不客气。需要的话，随时叫我。',
  start: s(26.4),
  pace: 2,
}
const LINES = [askEnglish, replyEnglish, askChinese, replyChinese, doneChinese, byeChinese]

/** Bell hears Chinese a few characters in and the screen switches. */
const SWITCH = s(17.3)
const LISTEN = s(5)
const SENT_EN = s(12)
const CLOSE_EN = s(15.6)
const SENT_ZH = s(21.2)
const CLOSE_ZH = s(24.2)
const SETTLE = s(29.4)

const status = (frame: number): VoiceStatus =>
  stepAt<VoiceStatus>(
    frame,
    [
      { at: lineEnd(askEnglish) + 4, value: 'thinking' },
      { at: replyEnglish.start, value: 'speaking' },
      { at: lineEnd(replyEnglish) + 6, value: 'listening' },
      { at: lineEnd(askChinese) + 4, value: 'thinking' },
      { at: replyChinese.start, value: 'speaking' },
      { at: lineEnd(replyChinese) + 6, value: 'listening' },
      { at: lineEnd(doneChinese) + 4, value: 'thinking' },
      { at: byeChinese.start, value: 'speaking' },
      { at: lineEnd(byeChinese) + 10, value: 'ended' },
    ],
    'listening',
  )

const main = (frame: number): VoiceMain => {
  if (frame < s(4.6)) return { kind: 'panel', state: 'idle' }
  if (frame < LISTEN) return { kind: 'panel', state: 'connecting' }
  if (frame < askEnglish.start) return { kind: 'panel', state: 'listening' }
  if (frame >= SETTLE) return { kind: 'panel', state: 'idle' }
  if (frame >= SENT_EN && frame < CLOSE_EN) {
    return { kind: 'sent', listening: true, items: [WATER, BLANKET].map((r) => ({ ...r })) }
  }
  if (frame >= SENT_ZH && frame < CLOSE_ZH) {
    return { kind: 'sent', listening: true, items: [{ ...PILLOW, label: zh(PILLOW.label) }] }
  }
  // Chip labels are English in the script and follow the screen language, like the rest.
  const t = translator(language(frame))
  const items = conversationAt(frame, LINES).map((item) =>
    item.kind === 'message' && item.actions
      ? { ...item, actions: item.actions.map((a) => ({ ...a, label: a.label && t(a.label) })) }
      : item,
  )
  return { kind: 'conversation', items, status: status(frame) }
}

const requests = (frame: number): DemoRequest[] => {
  if (frame < CLOSE_EN) return []
  const water = stepAt<DemoRequest['status']>(
    frame,
    [
      { at: s(30.6), value: 'seen' },
      { at: s(32.6), value: 'on_the_way' },
    ],
    'sent',
  )
  const pillow = stepAt<DemoRequest['status']>(frame, [{ at: s(31.6), value: 'seen' }], 'sent')
  return [
    ...(frame >= CLOSE_ZH ? [{ ...PILLOW, status: pillow }] : []),
    { ...WATER, status: water },
    { ...BLANKET, status: 'sent' },
  ]
}

const language = (frame: number): DemoLanguage => (frame >= SWITCH ? 'zh' : 'auto')

export const voiceScript: SceneScript = {
  stateAt: (frame): TabletState => ({
    language: language(frame),
    requests: requests(frame),
    view: { mode: 'voice', main: main(frame) },
  }),
  cuts: [askEnglish.start, SENT_EN, CLOSE_EN, SWITCH, SENT_ZH, CLOSE_ZH, SETTLE],
  clocks: [LISTEN, SENT_EN, CLOSE_EN, SENT_ZH, CLOSE_ZH],
  taps: [
    { at: CLOSE_EN - 4, find: byText('Looks good') },
    { at: CLOSE_ZH - 4, find: byText(zh('Looks good')) },
  ],
}

/** The captions beside the tablet, in local frames. */
export const voiceCaptions = [
  {
    from: s(0.4),
    to: s(3.0),
    eyebrow: 'Bell for patients',
    title: 'One screen at every bedside.',
    body: 'Patients ask for what they need, in their own words.',
  },
  {
    from: s(3.0),
    to: s(6.4),
    title: 'Tap the mic or say “Hey Bell.”',
    body: 'Either one starts listening. Bell hears its name on the tablet itself, so nothing leaves the room until then.',
    quote: { text: 'Hey Bell', from: s(0.5) },
  },
  {
    from: s(6.4),
    to: s(12.0),
    title: 'Talk like you would to a person.',
    body: 'Bell works out what you need and sends it to the right team.',
  },
  {
    from: s(12.0),
    to: s(16.2),
    title: 'Every request, confirmed.',
    body: 'See exactly what was sent. To change it, just keep talking.',
  },
  {
    from: s(16.2),
    to: s(24.4),
    title: 'Speaks their language.',
    body: 'Bell detects another language and switches on its own, and the whole screen follows. 100 languages in all.',
    quote: { text: askChinese.text, from: s(0.4), note: '“Also, could I have another pillow?”' },
  },
  {
    from: s(24.4),
    to: s(30.2),
    title: 'Done when they’re done.',
    body: 'Bell wraps up and goes back to quietly waiting.',
    quote: { text: doneChinese.text, from: s(0.4), note: '“That’s all, thanks.”' },
  },
  {
    from: s(30.2),
    to: VOICE_LENGTH,
    title: 'Always know where things stand.',
    body: 'Updates arrive live as the care team sees each request and heads over.',
  },
]
