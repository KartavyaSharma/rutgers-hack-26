// Types for the staff tables' typed columns. Type-only, so schema.ts (and drizzle-kit) can import it.

/** needs_ok: waiting for the nurse. handled: approved (or sent by Bell). rejected: dropped. done: finished. */
export type TicketState = 'needs_ok' | 'handled' | 'rejected' | 'done'

export type RecommendationSource = 'rules' | 'replan' | 'seed'

export type EventType =
  | 'created'
  | 'recommended'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'taken'
  | 'moved'
  | 'done'
  | 'memory_saved'
  | 'instruction'
  | 'instruction_confirmed'
  | 'patient_taken'
  | 'bell_note'

/**
 * Team-specific fields on a ticket. The shape follows `kind`:
 * - from the tablet: optionId / category / confidence / routeReason
 * - food.* and water: `diet` (the diet check read from the hospital layer)
 * - misc.bathroom, misc.reposition: `twoPeople` (fall risk)
 * - cleaning.*: `cleaning` (where, disinfecting clean for isolation)
 */
export interface TicketDetails {
  optionId?: string | null
  category?: string
  confidence?: number | null
  routeReason?: string | null
  /** Came from the tablet's "I need help immediately" button. */
  nurseButton?: boolean
  diet?: { restricted: boolean; text: string }
  twoPeople?: boolean
  cleaning?: { disinfect: boolean; where?: string }
  /** The patient's own words when they asked in another language (the ticket's `words` is English). */
  original?: { text: string; translated: boolean }
}

/** Display overrides for a task, cleared when someone moves it. */
export interface TaskDetails {
  /** Replaces the computed time label, e.g. "On hold", "On the way". */
  timeText?: string
  /** Word before the due time, e.g. "Pickup" gives "Pickup 15:30" (default "Due"). */
  duePrefix?: string
  /** Status for the patient's request list, e.g. "Nobody took it", "Booked 16:30". */
  statusText?: string
  /** Set when the signed-in nurse took it, for "You took it 15:14". */
  takenBy?: string
  takenAt?: string
}
