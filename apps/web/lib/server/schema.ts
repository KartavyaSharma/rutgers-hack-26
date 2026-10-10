import type {
  OptionId,
  RequestSource,
  RequestStatus,
  RouteReason,
  Team,
  Urgency,
} from '@bell/core/taxonomy'
import { sql } from 'drizzle-orm'
import { boolean, index, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
