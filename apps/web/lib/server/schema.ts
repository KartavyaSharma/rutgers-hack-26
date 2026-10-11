import type { Person, Plan, RequestChannel, TaskStatus, Tier } from '@bell/core/staff-api'
import type {
  OptionId,
  RequestSource,
  RequestStatus,
  RouteReason,
  Team,
  Urgency,
} from '@bell/core/taxonomy'
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type {
  EventType,
  RecommendationSource,
  TaskDetails,
  TicketDetails,
  TicketState,
} from './staff/types'

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

/** One row per patient request. Mirrors `CallRequest` from @bell/core. */
export const requests = pgTable(
  'requests',
  {
    id: uuid('id').primaryKey(),
    roomId: text('room_id').notNull(),
    team: text('team').$type<Team>().notNull(),
    category: text('category').notNull(),
    urgency: text('urgency').$type<Urgency>().notNull(),
    clinical: boolean('clinical').notNull().default(false),
    source: text('source').$type<RequestSource>().notNull(),
    optionId: text('option_id').$type<OptionId>(),
    text: text('text'),
    staffSummary: text('staff_summary').notNull(),
    patientReply: text('patient_reply'),
    language: text('language'),
    confidence: real('confidence'),
    routeReason: text('route_reason').$type<RouteReason>(),
    status: text('status').$type<RequestStatus>().notNull().default('sent'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    seenAt: timestamptz('seen_at'),
    claimedAt: timestamptz('claimed_at'),
    doneAt: timestamptz('done_at'),
    cancelledAt: timestamptz('cancelled_at'),
    /** Last "Still waiting?" tap from the patient. */
    nudgedAt: timestamptz('nudged_at'),
    /** What the patient said after an emergency call, oldest first (appended by the agent). */
    notes: jsonb('notes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [
    index('requests_team_status_created_idx').on(t.team, t.status, t.createdAt),
    index('requests_room_created_idx').on(t.roomId, t.createdAt),
  ],
)

export type RequestRow = typeof requests.$inferSelect
export type NewRequestRow = typeof requests.$inferInsert

// ---------------------------------------------------------------------------
// Staff app (Bell layer). These point at the hospital layer (patients, staff) by id and never
// copy clinical data. Names kept here are display snapshots of who asked and who was sent.
// ---------------------------------------------------------------------------

/** One patient request as the staff app sees it. `requestId` links the tablet's `requests` row. */
export const tickets = pgTable(
  'tickets',
  {
    id: text('id').primaryKey(),
    requestId: uuid('request_id').references(() => requests.id, { onDelete: 'set null' }),
    patientId: text('patient_id').notNull(),
    patientName: text('patient_name').notNull(),
    roomId: text('room_id').notNull(),
    bed: text('bed').notNull().default(''),
    unit: text('unit').notNull().default('4 West'),
    /** What the patient said or tapped, kept as-is. */
    words: text('words').notNull(),
    channel: text('channel').$type<RequestChannel>().notNull(),
    /** How the channel reads on the card, e.g. "Tapped Pain, then 8 of 10". Null = default. */
    channelNote: text('channel_note'),
    language: text('language'),
    /** Short "what" for lists and tasks, e.g. "Bathroom, two people". */
    title: text('title').notNull(),
    /** e.g. `food.water`, `cleaning.spill`, `misc.bathroom`. Picks the `details` shape. */
    kind: text('kind').notNull(),
    /** Where it is going now (a Team or a free label like "doctor"). */
    team: text('team').notNull(),
    tier: text('tier').$type<Tier>().notNull(),
    clinical: boolean('clinical').notNull().default(false),
    watch: text('watch'),
    state: text('state').$type<TicketState>().notNull().default('needs_ok'),
    /** The nurse assigned to the patient when the request came in. */
    nurseId: text('nurse_id'),
    details: jsonb('details').$type<TicketDetails>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    decidedAt: timestamptz('decided_at'),
    doneAt: timestamptz('done_at'),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('tickets_state_created_idx').on(t.state, t.createdAt),
    index('tickets_patient_created_idx').on(t.patientId, t.createdAt),
    index('tickets_request_idx').on(t.requestId),
  ],
)

/** Bell's plan for a ticket. Versioned, never overwritten. */
export const recommendations = pgTable(
  'recommendations',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    plan: jsonb('plan').$type<Plan>().notNull(),
    /** One line under the quote in the Incoming list. */
    summary: text('summary').notNull(),
    team: text('team').notNull(),
    tier: text('tier').$type<Tier>().notNull(),
    /** Who made it: the rules planner, a replan after a rejection, or the demo seed. */
    source: text('source').$type<RecommendationSource>().notNull(),
    confidence: real('confidence'),
    /** Hospital facts the plan used, as they read at the time ("Nothing by mouth until after MRI"). */
    facts: jsonb('facts').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    memoryIds: jsonb('memory_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('recommendations_ticket_version_idx').on(t.ticketId, t.version)],
)

/** The nurse's decision on one recommendation. */
export const reviews = pgTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    recommendationId: text('recommendation_id').references(() => recommendations.id),
    reviewerId: text('reviewer_id').notNull(),
    reviewerName: text('reviewer_name').notNull(),
    verdict: text('verdict').$type<'approve' | 'reject'>().notNull(),
    /** Reject: the team the nurse picked instead, if any. */
    team: text('team'),
    reason: text('reason'),
    /** Approve: the nurse's note and the people they kept. */
    note: text('note'),
    sendIds: jsonb('send_ids').$type<string[]>(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('reviews_ticket_idx').on(t.ticketId)],
)

/** Work for a person or team: from an approved plan, Ask Bell, or the shift (rounds). */
export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    /** Null for unit-wide work like a vitals round. */
    patientId: text('patient_id'),
    /** Display snapshot, e.g. "Jorge Reyes" or "All your patients". */
    patientName: text('patient_name').notNull(),
    /** "416A", or "6 rooms" for rounds. */
    room: text('room').notNull(),
    unit: text('unit').notNull().default('4 West'),
    title: text('title').notNull(),
    tier: text('tier').$type<Tier>().notNull(),
    /** Staff id, or `team:<slug>` for a team that is not a person. */
    ownerId: text('owner_id').notNull(),
    owner: jsonb('owner').$type<Person>().notNull(),
    status: text('status').$type<TaskStatus>().notNull(),
    note: text('note'),
    /** Staff id, or 'bell' when Bell made it on its own. */
    createdBy: text('created_by'),
    details: jsonb('details').$type<TaskDetails>().notNull().default(sql`'{}'::jsonb`),
    dueAt: timestamptz('due_at'),
    statusAt: timestamptz('status_at').notNull().defaultNow(),
    startedAt: timestamptz('started_at'),
    doneAt: timestamptz('done_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('tasks_status_idx').on(t.status, t.statusAt),
    index('tasks_owner_idx').on(t.ownerId),
    index('tasks_patient_idx').on(t.patientId),
    index('tasks_ticket_idx').on(t.ticketId),
  ],
)

/** Append-only timeline. Undo is a new event, never a delete. */
export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    ticketId: text('ticket_id'),
    taskId: text('task_id'),
    patientId: text('patient_id'),
    type: text('type').$type<EventType>().notNull(),
    /** 'patient', 'bell', 'system' or a staff id. */
    actor: text('actor').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('events_ticket_idx').on(t.ticketId, t.createdAt),
    index('events_patient_type_idx').on(t.patientId, t.type, t.createdAt),
  ],
)

/**
 * Past corrections Bell can reuse as hints (not rules). Plain text match for now;
 * a pgvector `embedding` column and similarity search come later.
 */
export const memory = pgTable(
  'memory',
  {
    id: text('id').primaryKey(),
    /** What the patient asked. */
    requestText: text('request_text').notNull(),
    /** The nurse's reason, in their words. */
    text: text('text').notNull(),
    kind: text('kind'),
    teamSaid: text('team_said'),
    teamChosen: text('team_chosen'),
    ticketId: text('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    patientId: text('patient_id'),
    unit: text('unit').notNull().default('4 West'),
    createdBy: text('created_by').notNull(),
    timesUsed: integer('times_used').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('memory_unit_active_idx').on(t.unit, t.active)],
)

export type TicketRow = typeof tickets.$inferSelect
export type RecommendationRow = typeof recommendations.$inferSelect
export type ReviewRow = typeof reviews.$inferSelect
export type TaskRow = typeof tasks.$inferSelect
export type EventRow = typeof events.$inferSelect
export type MemoryRow = typeof memory.$inferSelect
