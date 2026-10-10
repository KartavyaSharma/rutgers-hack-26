import { randomUUID } from 'node:crypto'
import type { CallRequest, DraftStatus, RequestDraft, RouteResult } from '@bell/core/taxonomy'
import { and, desc, eq, type SQL, sql } from 'drizzle-orm'
import { publish } from './bus'
import { getDb } from './db'
import { fromDecision, insertRequest, toCallRequest } from './requests'
import { type DraftRow, drafts, requests } from './schema'

export const toRequestDraft = (row: DraftRow): RequestDraft => ({
  id: row.id,
  roomId: row.roomId,
  source: row.source,
  text: row.text,
  decision: row.decision,
  patientText: row.patientText,
  status: row.status,
  requestId: row.requestId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export interface NewDraft {
  roomId: string
  source: RequestDraft['source']
  text: string
  decision: RouteResult
  patientText: string
}

/**
 * Create a pending draft. The newest draft replaces older ones: any other pending draft for the
 * room is discarded in the same transaction, so the room never has more than one pending draft.
 */
export const createDraft = async (input: NewDraft): Promise<RequestDraft> => {
  const db = await getDb()
  const { created, replaced } = await db.transaction(async (tx) => {
    const replacedRows = await tx
      .update(drafts)
      .set({ status: 'discarded', updatedAt: sql`now()` })
      .where(and(eq(drafts.roomId, input.roomId), eq(drafts.status, 'pending')))
      .returning()
    const [row] = await tx
      .insert(drafts)
      .values({ ...input, id: randomUUID(), status: 'pending' })
      .returning()
    if (!row) throw new Error('Insert returned no row')
    return { created: row, replaced: replacedRows }
  })

  for (const row of replaced) publish({ type: 'draft.updated', draft: toRequestDraft(row) })
  const draft = toRequestDraft(created)
  publish({ type: 'draft.created', draft })
  return draft
}

export interface DraftQuery {
  roomId?: string
  status: DraftStatus | 'all'
  limit: number
}

export const listDrafts = async (query: DraftQuery): Promise<RequestDraft[]> => {
  const db = await getDb()
  const conditions: SQL[] = []
  if (query.roomId) conditions.push(eq(drafts.roomId, query.roomId))
  if (query.status !== 'all') conditions.push(eq(drafts.status, query.status))
  const rows = await db
    .select()
    .from(drafts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(drafts.createdAt))
    .limit(query.limit)
  return rows.map(toRequestDraft)
}

export const getDraft = async (id: string): Promise<RequestDraft | null> => {
  const db = await getDb()
  const [row] = await db.select().from(drafts).where(eq(drafts.id, id)).limit(1)
  return row ? toRequestDraft(row) : null
}

export type ConfirmResult =
  | { kind: 'confirmed'; draft: RequestDraft; request: CallRequest }
  | { kind: 'already_confirmed'; draft: RequestDraft; request: CallRequest | null }
  | { kind: 'discarded'; draft: RequestDraft }
  | { kind: 'not_found' }

/**
 * Confirm a draft (the tablet's Send, or the patient's spoken yes via the agent). Idempotent:
 * the draft row is locked, so a tap and a spoken yes at the same moment create one request.
 */
export const confirmDraft = async (id: string): Promise<ConfirmResult> => {
  const db = await getDb()
  const result = await db.transaction(async (tx): Promise<ConfirmResult> => {
    const [row] = await tx.select().from(drafts).where(eq(drafts.id, id)).for('update')
    if (!row) return { kind: 'not_found' }
    if (row.status === 'discarded') return { kind: 'discarded', draft: toRequestDraft(row) }
    if (row.status === 'confirmed') {
      const [requestRow] = row.requestId
        ? await tx.select().from(requests).where(eq(requests.id, row.requestId)).limit(1)
        : []
      return {
        kind: 'already_confirmed',
        draft: toRequestDraft(row),
        request: requestRow ? toCallRequest(requestRow) : null,
      }
    }

    const request = await insertRequest(
      tx,
      fromDecision(row.roomId, row.source, row.text, row.decision),
    )
    const [updated] = await tx
      .update(drafts)
      .set({ status: 'confirmed', requestId: request.id, updatedAt: sql`now()` })
      .where(eq(drafts.id, id))
      .returning()
    if (!updated) throw new Error('Draft vanished while confirming')
    return { kind: 'confirmed', draft: toRequestDraft(updated), request }
  })

  if (result.kind === 'confirmed') {
    // Draft first, so a room screen knows the request came from this draft.
    publish({ type: 'draft.updated', draft: result.draft })
    publish({ type: 'request.created', request: result.request })
  }
  return result
}

export type DiscardResult =
  | { kind: 'discarded'; draft: RequestDraft; changed: boolean }
  | { kind: 'already_confirmed'; draft: RequestDraft }
  | { kind: 'not_found' }

/** Discard a pending draft. Discarding twice is fine; a confirmed draft cannot be discarded. */
export const discardDraft = async (id: string): Promise<DiscardResult> => {
  const db = await getDb()
  const [row] = await db
    .update(drafts)
    .set({ status: 'discarded', updatedAt: sql`now()` })
    .where(and(eq(drafts.id, id), eq(drafts.status, 'pending')))
    .returning()
  if (row) {
    const draft = toRequestDraft(row)
    publish({ type: 'draft.updated', draft })
    return { kind: 'discarded', draft, changed: true }
  }

  const current = await getDraft(id)
  if (!current) return { kind: 'not_found' }
  if (current.status === 'confirmed') return { kind: 'already_confirmed', draft: current }
  return { kind: 'discarded', draft: current, changed: false }
}
