import { randomUUID } from 'node:crypto'
import type { NewCallRequest, RequestOutlet } from '@bell/core/adapters'
import {
  type CallRequest,
  NURSE_BUTTON,
  type OptionId,
  optionById,
  type RequestAction,
  type RequestStatus,
  type RouteResult,
} from '@bell/core/taxonomy'
import { and, desc, eq, inArray, ne, type SQL, sql } from 'drizzle-orm'
import { publish } from './bus'
import { type Executor, getDb } from './db'
import { type RequestRow, requests } from './schema'
import type { ListQuery } from './validate'

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null)

export const toCallRequest = (row: RequestRow): CallRequest => ({
  id: row.id,
  roomId: row.roomId,
  team: row.team,
  category: row.category,
  urgency: row.urgency,
  clinical: row.clinical,
  source: row.source,
  optionId: row.optionId,
  text: row.text,
  staffSummary: row.staffSummary,
  patientReply: row.patientReply,
  language: row.language,
  confidence: row.confidence,
  routeReason: row.routeReason,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  seenAt: iso(row.seenAt),
  claimedAt: iso(row.claimedAt),
  doneAt: iso(row.doneAt),
})

/** A request option on the tablet. Fixed destination, never the AI. */
export const fromOption = (roomId: string, optionId: OptionId): NewCallRequest => {
  const option = optionById(optionId)
  return {
    roomId,
    team: option.team,
    category: option.category,
    urgency: option.urgency,
    clinical: false,
    source: 'tile',
    optionId,
    text: null,
    staffSummary: option.staffSummary,
    patientReply: null,
    language: null,
    confidence: null,
    routeReason: null,
  }
}

/** The "My nurse" button. Always the nurse, never the AI. */
export const fromNurseButton = (roomId: string): NewCallRequest => ({
  roomId,
  team: NURSE_BUTTON.team,
  category: NURSE_BUTTON.category,
  urgency: NURSE_BUTTON.urgency,
  clinical: false,
  source: 'nurse_button',
  optionId: null,
  text: null,
  staffSummary: NURSE_BUTTON.staffSummary,
  patientReply: null,
  language: null,
  confidence: null,
  routeReason: null,
})

/** Typed or spoken text, routed by the AI router. */
export const fromDecision = (
  roomId: string,
  source: 'typed' | 'voice',
  text: string,
  decision: RouteResult,
): NewCallRequest => {
  // Safety net: anything marked clinical belongs to the nurse, whatever team came back.
  const forceNurse = decision.clinical && decision.team !== 'nurse'
  return {
    roomId,
    team: forceNurse ? 'nurse' : decision.team,
    category: decision.category,
    urgency: decision.urgency,
    clinical: decision.clinical,
    source,
    optionId: null,
    text,
    staffSummary: decision.staffSummary,
    patientReply: decision.patientReply || null,
    language: decision.language || null,
    confidence: decision.confidence,
    routeReason: forceNurse ? 'clinical' : decision.reason,
  }
}

/** Insert a request with `executor` (the database, or a transaction such as a draft confirm). */
export const insertRequest = async (
  executor: Executor,
  request: NewCallRequest,
): Promise<CallRequest> => {
  const [row] = await executor
    .insert(requests)
    .values({ ...request, id: randomUUID(), status: 'sent' })
    .returning()
  if (!row) throw new Error('Insert returned no row')
  return toCallRequest(row)
}

/** Today's only outlet: our own database. Real hospital systems would implement RequestOutlet too. */
export const databaseOutlet: RequestOutlet = {
  name: 'database',
  async deliver(request: NewCallRequest): Promise<CallRequest> {
    return insertRequest(await getDb(), request)
  },
}

/** Deliver a new request, then tell live screens about it. */
export const createRequest = async (input: NewCallRequest): Promise<CallRequest> => {
  const request = await databaseOutlet.deliver(input)
  publish({ type: 'request.created', request })
  return request
}

export const listRequests = async (query: ListQuery): Promise<CallRequest[]> => {
  const db = await getDb()
  const conditions: SQL[] = []
  if (query.team) conditions.push(eq(requests.team, query.team))
  if (query.roomId) conditions.push(eq(requests.roomId, query.roomId))
  if (query.status === 'open') conditions.push(ne(requests.status, 'done'))
  else if (query.status !== 'all') conditions.push(eq(requests.status, query.status))

  const rows = await db
    .select()
    .from(requests)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(requests.createdAt))
    .limit(query.limit)
  return rows.map(toCallRequest)
}

export const getRequest = async (id: string): Promise<CallRequest | null> => {
  const db = await getDb()
  const [row] = await db.select().from(requests).where(eq(requests.id, id)).limit(1)
  return row ? toCallRequest(row) : null
}

export type ActionResult =
  | { kind: 'updated'; request: CallRequest }
  | { kind: 'unchanged'; request: CallRequest }
  | { kind: 'conflict'; request: CallRequest; message: string }
  | { kind: 'not_found' }

/**
 * seen: sent -> seen (no-op otherwise).
 * claim: sent|seen -> on_the_way (no-op if already on the way, conflict if done).
 * done: anything -> done (no-op if already done).
 * Each is one conditional UPDATE, so concurrent staff clicks can't regress a status.
 */
export const applyRequestAction = async (
  id: string,
  action: RequestAction,
): Promise<ActionResult> => {
  const db = await getDb()
  const now = sql`now()`
  const seenAt = sql`coalesce(${requests.seenAt}, now())`

  const update = (() => {
    switch (action) {
      case 'seen':
        return db
          .update(requests)
          .set({ status: 'seen', seenAt: now, updatedAt: now })
          .where(and(eq(requests.id, id), eq(requests.status, 'sent')))
      case 'claim':
        return db
          .update(requests)
          .set({ status: 'on_the_way', seenAt, claimedAt: now, updatedAt: now })
          .where(and(eq(requests.id, id), inArray(requests.status, ['sent', 'seen'])))
      case 'done':
        return db
          .update(requests)
          .set({ status: 'done', seenAt, doneAt: now, updatedAt: now })
          .where(and(eq(requests.id, id), ne(requests.status, 'done')))
    }
  })()

  const [row] = await update.returning()
  if (row) {
    const request = toCallRequest(row)
    publish({ type: 'request.updated', request })
    return { kind: 'updated', request }
  }

  const current = await getRequest(id)
  if (!current) return { kind: 'not_found' }
  if (action === 'claim' && current.status === 'done') {
    return { kind: 'conflict', request: current, message: 'This request is already done' }
  }
  return { kind: 'unchanged', request: current }
}

/**
 * Set a status directly (dev view and future integrations). Timestamps follow the status:
 * earlier steps are filled in if missing, later ones are cleared when moving backwards.
 */
export const setRequestStatus = async (
  id: string,
  status: RequestStatus,
): Promise<ActionResult> => {
  const db = await getDb()
  const now = sql`now()`
  const keepOrNow = (column: typeof requests.seenAt) => sql`coalesce(${column}, now())`

  const timestamps = (() => {
    switch (status) {
      case 'sent':
        return { seenAt: null, claimedAt: null, doneAt: null }
      case 'seen':
        return { seenAt: keepOrNow(requests.seenAt), claimedAt: null, doneAt: null }
      case 'on_the_way':
        return {
          seenAt: keepOrNow(requests.seenAt),
          claimedAt: keepOrNow(requests.claimedAt),
          doneAt: null,
        }
      case 'done':
        return { seenAt: keepOrNow(requests.seenAt), doneAt: keepOrNow(requests.doneAt) }
    }
  })()

  const [row] = await db
    .update(requests)
    .set({ status, ...timestamps, updatedAt: now })
    .where(and(eq(requests.id, id), ne(requests.status, status)))
    .returning()
  if (row) {
    const request = toCallRequest(row)
    publish({ type: 'request.updated', request })
    return { kind: 'updated', request }
  }

  const current = await getRequest(id)
  return current ? { kind: 'unchanged', request: current } : { kind: 'not_found' }
}
