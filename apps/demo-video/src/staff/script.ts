import { s } from '../lib/time'
import { STORY } from '../story'
import { ASK_PLAN, ASK_TEXT, boardTasks, incomingItems } from './data'
import type { StaffScript } from './staff-scene'
import type { StaffState } from './staff-screen'

// One take on Priya's screen: Ruth's request lands from her tablet, Priya reads Bell's plan and
// approves it, checks what Bell handled on its own (Mei's pillow, asked in Chinese), then the
// Tasks board, where she asks Bell for a task in plain words. Timed by src/story.ts.

export const STAFF_LENGTH = STORY.length

const {
  arrive: ARRIVE,
  openRuth: OPEN_RUTH,
  approve: APPROVE,
  handled: HANDLED,
  seeOriginal: SEE_ORIGINAL,
  tasks: TASKS,
  meiDone: MEI_DONE,
  typeFrom: TYPE_FROM,
  send: SEND,
  plan: PLAN,
  confirm: CONFIRM,
} = STORY
const TYPE_PACE = 2

const typed = (frame: number) =>
  ASK_TEXT.slice(0, Math.max(0, Math.floor((frame - TYPE_FROM) / TYPE_PACE)))

const stateAt = (frame: number): StaffState => {
  const ruth = frame < ARRIVE ? 'none' : frame < APPROVE ? 'new' : 'approved'
  const tab = frame >= HANDLED ? 'handled' : 'need'
  return {
    page: frame >= TASKS ? 'tasks' : 'incoming',
    incoming: {
      tab,
      items: incomingItems({ ruth }),
      selectedId:
        tab === 'handled'
          ? 'tk-mei-pillow'
          : frame >= OPEN_RUTH && frame < APPROVE
            ? 'tk-ruth-chest'
            : 'tk-jorge-bathroom',
      showOriginal: frame >= SEE_ORIGINAL,
    },
    tasks: {
      list: boardTasks({ meiDone: frame >= MEI_DONE, sugar: frame >= CONFIRM }),
      askText: frame >= CONFIRM ? '' : typed(frame),
      asking: frame >= SEND && frame < PLAN,
      ...(frame >= PLAN && frame < CONFIRM ? { plan: ASK_PLAN } : {}),
    },
  }
}

const button = (text: string) => (screen: HTMLElement) =>
  [...screen.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) ?? null

export const railCard = (name: string) => (screen: HTMLElement) =>
  [...screen.querySelectorAll('aside[aria-label="Requests"] button[aria-pressed]')].find((b) =>
    b.textContent?.includes(name),
  ) ?? null

const askBar = (screen: HTMLElement) => screen.querySelector('[data-ask]')
const plan = (screen: HTMLElement) => screen.querySelector('[data-plan]')
const quote = (screen: HTMLElement) => screen.querySelector('[data-quote]')

export const staffScript: StaffScript = {
  stateAt,
  cuts: [OPEN_RUTH, APPROVE, HANDLED, TASKS, CONFIRM],
  clicks: [
    { at: OPEN_RUTH, find: railCard('Ruth Okafor') },
    { at: APPROVE, find: button('Approve') },
    { at: HANDLED, find: button('Bell handled') },
    { at: SEE_ORIGINAL, find: button('See original') },
    { at: TASKS, find: (screen) => screen.querySelector('[data-tab="tasks"]') },
    { at: TYPE_FROM - 6, find: (screen) => screen.querySelector('input[name="ask"]') },
    { at: SEND, find: button('Send') },
    { at: CONFIRM, find: button('Confirm') },
  ],
  camera: [
    { at: 0, zoom: 1 },
    { at: ARRIVE + s(0.2), zoom: 1 },
    // Lean in on the new card, then pan across to Bell's plan once it is open.
    { at: ARRIVE + s(1), zoom: 1.3, find: railCard('Ruth Okafor') },
    { at: OPEN_RUTH + s(0.8), zoom: 1.3, find: railCard('Ruth Okafor') },
    { at: OPEN_RUTH + s(2.6), zoom: 1.38, find: plan },
    { at: APPROVE - s(1.8), zoom: 1.38, find: plan },
    { at: APPROVE - s(0.8), zoom: 1 },
    { at: SEE_ORIGINAL - s(0.6), zoom: 1.5, find: quote },
    { at: TASKS - s(1.2), zoom: 1.5, find: quote },
    { at: TASKS - s(0.4), zoom: 1 },
    { at: TYPE_FROM - s(0.4), zoom: 1 },
    // The bar is full width: sit on its left while typing, then slide over to Confirm.
    { at: TYPE_FROM + s(0.4), zoom: 1.3, find: askBar, x: 420 },
    { at: CONFIRM - s(1), zoom: 1.3, find: askBar, x: 420 },
    { at: CONFIRM - s(0.2), zoom: 1.3, find: askBar, x: 980 },
    { at: CONFIRM + s(0.6), zoom: 1 },
  ],
  toasts: [
    { at: APPROVE + 3, text: 'Sent to you and Dana Kerr' },
    { at: CONFIRM + 3, text: 'Sent to Sam Kim' },
  ],
  highlights: [{ from: ARRIVE, to: ARRIVE + s(2), find: railCard('Ruth Okafor') }],
}

export const staffCaptions = [
  {
    // Gone before her words take off, so the flight crosses a clear stage.
    from: s(0.4),
    to: STORY.flyOut,
    eyebrow: 'From the bedside',
    title: 'It starts with a few words.',
    body: 'Ruth tells her tablet that her chest feels tight.',
  },
  {
    from: ARRIVE,
    to: OPEN_RUTH + s(1.4),
    title: 'Straight to the right nurse.',
    body: 'Bell checks Ruth’s chart, flags it urgent and puts it at the top of Priya’s queue.',
  },
  {
    from: OPEN_RUTH + s(1.4),
    to: APPROVE - s(0.6),
    title: 'A plan, not just an alert.',
    body: 'Who to send, what to tell the patient, what to watch for, and why.',
  },
  {
    from: APPROVE - s(0.6),
    to: STORY.told - s(0.2),
    title: 'One click to approve.',
    body: 'Priya and Dana are sent, and Bell keeps watch until Ruth is seen.',
  },
  {
    from: STORY.told - s(0.2),
    to: HANDLED - s(0.2),
    title: 'Back at the bedside.',
    body: 'Ruth hears that Priya is on her way, and sees it on her tablet.',
  },
  {
    from: HANDLED - s(0.2),
    to: TASKS - s(0.2),
    title: 'Simple asks never wait on a nurse.',
    body: 'Water, blankets, the TV: Bell sends them straight to the right person, in any language.',
  },
  {
    from: TASKS - s(0.2),
    to: TYPE_FROM - s(0.6),
    title: 'The whole floor on one board.',
    body: 'Every request becomes a task with an owner, updated live as the team works.',
  },
  {
    from: TYPE_FROM - s(0.6),
    to: STAFF_LENGTH,
    title: 'Just tell Bell.',
    body: 'Type it or say it. Bell turns it into a task for the right person.',
  },
]
