// Shapes the staff app (apps/staff) gets from apps/web's /api/staff/* routes.
// apps/web builds these from Bell's tables (tickets, recommendations, reviews, events, memory)
// plus the hospital layer (see ./hospital). Screens never talk to the hospital layer directly.

import type { PatientChart, StaffMember } from './hospital'

/** Four levels. Routine shows no tag in the UI. */
export type Tier = 'urgent' | 'high' | 'routine' | 'scheduled'

export type RequestChannel = 'voice' | 'typed' | 'button'

export interface Person {
  id: string
  name: string
  roleLabel: string
  photoUrl?: string
}

/** Bell's suggested solution for one incoming request. */
export interface Plan {
  goal: string
  /** Who Bell would send. Empty when Bell answers the patient itself. */
  send: Person[]
  /** Shown when send is empty, e.g. "No one. Bell answers Ade." */
  sendLine?: string
  sendNote?: string
  tell?: { text: string; channel: string }
  watch?: string
  chart?: string
  why: string
}

export interface IncomingItem {
  id: string
  patientId: string
  patientName: string
  /** "Room 416, Bed A" */
  roomLabel: string
  words: string
  channel: RequestChannel
  /** ISO time the patient asked. */
  askedAt: string
  /** One line under the quote in the list, e.g. "Lee Martin and Sam Kim, with a gait belt". */
  summary: string
  tier: Tier
  /** One watch tag for the header, e.g. "Fall risk". */
  watch?: string
  plan: Plan
  /** needs_ok: waiting for the nurse. handled: Bell sent it on its own (non-clinical) or the nurse approved it. */
  state: 'needs_ok' | 'handled'
  handledNote?: string
}

export interface PatientRow {
  patientId: string
  name: string
  /** "416A · 77 M" */
  line: string
  mine: boolean
  /** Assigned nurse name for the whole floor view; "No nurse yet" when unassigned. */
  nurseName?: string
  canTake: boolean
  watch?: string
  watchMore: number
  /** The most urgent open request waiting on this patient's nurse. */
  ask?: { tier: Tier; words: string; askedAt: string }
  /** The most relevant request with another team. */
  sent?: { what: string; status: string; stuck: boolean; more: number }
  doneToday: number
  /** Today's series for the small charts. */
  vitals: { heartRate: number[]; systolic: number[]; oxygen: number[] }
}

export type TaskStatus = 'needs_help' | 'waiting' | 'assigned' | 'in_progress' | 'done'

export interface Task {
  id: string
  tier: Tier
  title: string
  patientName: string
  /** "416A", or "6 rooms" for rounds. */
  room: string
  owner: Person
  status: TaskStatus
  /** "Due 16:00", "Since 15:13", "Done 15:09" */
  timeLabel: string
  note?: string
  /** Bell's suggested order for the signed-in nurse (1 = first). */
  order?: number
  mine: boolean
}

/** A request row in the patient dialog and the Incoming side panel. */
export interface PatientRequest {
  id: string
  tier: Tier
  what: string
  who: string
  status: string
  tone: 'needs_you' | 'stuck' | 'active' | 'done'
}

export interface PatientDetail {
  chart: PatientChart
  /** Bell's short notes for the nurse, from Epic, the handoff and today's requests. */
  notes: string
  requests: PatientRequest[]
}

/** What Bell will do for a line the nurse typed or said in the Ask Bell bar. */
export interface AskPlan {
  id: string
  title: string
  detail: string
}

export interface Session {
  staff: StaffMember
}

// Routes (all JSON; the staff app calls them through its /api proxy):
// GET  /api/staff/incoming                         -> IncomingItem[]
// POST /api/staff/incoming/:id/approve  { note?, sendIds? }  -> IncomingItem
// POST /api/staff/incoming/:id/reject   { team?, reason? }   -> IncomingItem
// GET  /api/staff/patients?scope=mine|floor        -> PatientRow[]
// POST /api/staff/patients/:id/take                -> PatientRow
// GET  /api/staff/patients/:id                     -> PatientDetail
// GET  /api/staff/tasks?scope=mine|everyone        -> Task[]
// PATCH /api/staff/tasks/:id  { status?, take? }   -> Task
// POST /api/staff/ask  { text }                    -> AskPlan
// POST /api/staff/ask/:id/confirm                  -> Task
// POST /api/staff/login  { email, password }       -> Session (also sets the session cookie)
// POST /api/staff/logout                           -> { ok: true }
// GET  /api/staff/me                               -> Session | 401
// The signed-in staff member comes from the `bell_staff` session cookie (see ./session).
