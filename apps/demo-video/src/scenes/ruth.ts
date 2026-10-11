import { stepAt } from '../lib/time'
import { STORY } from '../story'
import type { DemoRequest } from '../tablet/data'
import type { TabletState, VoiceMain } from '../tablet/tablet-screen'
import { conversationAt, type Line, lineEnd, type SceneScript } from './scene-view'

// Ruth's tablet for the staff video: she says her chest feels tight, Bell calls her nurse, and
// once Priya approves, Bell tells her Priya is on her way. Timed by src/story.ts.

const RUTH = { firstName: 'Ruth', room: '408', bed: 'A' }

const ask: Line = {
  id: 'ruth-ask',
  from: 'patient',
  text: 'My chest feels tight and it’s getting worse.',
  start: STORY.ask,
  pace: STORY.askPace,
}
const reply: Line = {
  id: 'ruth-reply',
  from: 'agent',
  text: 'I’ve told your nurse right away. Please stay in bed.',
  start: STORY.reply,
  pace: 3,
  actions: [{ id: 'ruth-nurse', kind: 'nurse' }],
  actionsAt: STORY.replyChips,
}
const told: Line = {
  id: 'ruth-told',
  from: 'agent',
  text: 'Your nurse Priya is on her way right now. Stay in bed and press the button if it gets worse.',
  start: STORY.told,
  pace: 3,
}
const LINES = [ask, reply, told]

const main = (frame: number): VoiceMain => {
  if (frame < STORY.heyBell) return { kind: 'panel', state: 'idle' }
  if (frame < ask.start) return { kind: 'panel', state: 'listening' }
  return {
    kind: 'conversation',
    items: conversationAt(frame, LINES),
    status: stepAt(
      frame,
      [
        { at: lineEnd(ask) + 3, value: 'thinking' as const },
        { at: reply.start, value: 'speaking' as const },
        { at: lineEnd(reply) + 6, value: 'listening' as const },
        { at: told.start, value: 'speaking' as const },
        { at: lineEnd(told) + 6, value: 'listening' as const },
      ],
      'listening' as const,
    ),
  }
}

const requests = (frame: number): DemoRequest[] =>
  frame < STORY.arrive
    ? []
    : [
        {
          id: 'ruth-chest',
          label: 'Chest feels tight',
          icon: 'alert',
          status: frame >= STORY.onTheWay ? 'on_the_way' : frame >= STORY.approve ? 'seen' : 'sent',
        },
      ]

export const ruthScript: SceneScript = {
  stateAt: (frame): TabletState => ({
    patient: RUTH,
    language: 'auto',
    requests: requests(frame),
    view: { mode: 'voice', main: main(frame) },
  }),
  cuts: [ask.start],
  clocks: [STORY.heyBell, ask.start],
}
