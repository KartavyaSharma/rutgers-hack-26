import { s } from './lib/time'

// The staff video's timeline, shared by both bundles: the staff screen (src/staff/script.ts)
// and Ruth's tablet clip (src/scenes/ruth.ts), which is rendered from the patient bundle and
// played inside the staff video frame for frame. Local frames from when the window appears.

export const STORY = {
  /** Ruth's tablet: "Hey Bell", her words, Bell's reply with "Nurse called". */
  heyBell: s(0.9),
  ask: s(1.7),
  askPace: 5,
  reply: s(3.6),
  replyChips: s(4.1),
  /** Her request flies from the tablet to Priya's queue and lands. */
  flyOut: s(4.4),
  arrive: s(5.6),
  /** Priya opens it, reads the plan, approves. */
  openRuth: s(8.2),
  approve: s(15.8),
  /** Bell's message flies back to the tablet, which shows it. */
  flyBack: s(16.4),
  told: s(17.6),
  onTheWay: s(18.4),
  /** The tablet is on screen for the two bedside moments. */
  tabletOut: s(9.8),
  tabletBackIn: s(16),
  tabletGone: s(21.6),
  /** The rest of Priya's screen. */
  handled: s(22),
  seeOriginal: s(24.8),
  tasks: s(28.8),
  meiDone: s(31.6),
  typeFrom: s(35.2),
  send: s(38),
  plan: s(38.6),
  confirm: s(40.6),
  length: s(43),
} as const

/** How long Ruth's tablet clip runs (it is only seen until `tabletGone`). */
export const RUTH_CLIP_LENGTH = s(22)
