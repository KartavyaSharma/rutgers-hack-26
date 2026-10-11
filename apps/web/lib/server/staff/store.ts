// Shared reads over the staff tables, plus the result type the routes turn into responses.

import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import type { Executor } from '../db'
import {
  type RecommendationRow,
  type ReviewRow,
  recommendations,
  requests,
  reviews,
  type TaskRow,
  type TicketRow,
  tasks,
} from '../schema'

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404 | 409; message: string }

export const done = <T>(value: T): Result<T> => ({ ok: true, value })
export const refuse = <T = never>(status: 400 | 403 | 404 | 409, message: string): Result<T> => ({
  ok: false,
  status,
  message,
})

/** Latest recommendation per ticket. */
export const latestRecommendations = async (
  db: Executor,
  ticketIds: string[],
): Promise<Map<string, RecommendationRow>> => {
  const map = new Map<string, RecommendationRow>()
  if (!ticketIds.length) return map
  const rows = await db
    .select()
    .from(recommendations)
    .where(inArray(recommendations.ticketId, ticketIds))
    .orderBy(desc(recommendations.version))
  for (const row of rows) if (!map.has(row.ticketId)) map.set(row.ticketId, row)
  return map
}

/** Latest review per ticket. */
export const latestReviews = async (
  db: Executor,
  ticketIds: string[],
): Promise<Map<string, ReviewRow>> => {
  const map = new Map<string, ReviewRow>()
  if (!ticketIds.length) return map
  const rows = await db
    .select()
    .from(reviews)
    .where(inArray(reviews.ticketId, ticketIds))
    .orderBy(desc(reviews.createdAt))
  for (const row of rows) if (!map.has(row.ticketId)) map.set(row.ticketId, row)
  return map
}

export const openTasks = async (db: Executor): Promise<TaskRow[]> =>
  db.select().from(tasks).where(ne(tasks.status, 'done'))

/** Tickets still waiting for the nurse whose tablet request the patient has since cancelled. */
export const cancelledTickets = async (db: Executor, rows: TicketRow[]): Promise<Set<string>> => {
  const byRequest = new Map<string, string>()
  for (const t of rows) if (t.requestId && t.state === 'needs_ok') byRequest.set(t.requestId, t.id)
  if (!byRequest.size) return new Set()
  const found = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(inArray(requests.id, [...byRequest.keys()]), eq(requests.status, 'cancelled')))
  return new Set(found.flatMap((r) => byRequest.get(r.id) ?? []))
}
