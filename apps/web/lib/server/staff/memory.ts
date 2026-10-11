// Correction memory: what nurses said when they rejected a plan. Bell reuses these as hints,
// never as rules (a memory can't move a clinical request away from the nurse).
// Matching is plain word overlap for now; pgvector similarity search over embeddings comes later.

import { and, desc, eq, sql } from 'drizzle-orm'
import type { Executor } from '../db'
import { type MemoryRow, memory } from '../schema'
import { UNIT } from './context'
import { newId } from './util'

const STOP = new Set(
  'the and for you can have get got some more there that this with not but are was its it’s i’m please need want would like could my me to of in on at a an is be'.split(
    ' ',
  ),
)

const words = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )

/** Up to 3 active memories from this unit that look like this request, best first. */
export const similarMemories = async (
  db: Executor,
  requestText: string,
  kind: string,
): Promise<MemoryRow[]> => {
  const query = words(requestText)
  if (!query.size) return []
  const rows = await db
    .select()
    .from(memory)
    .where(and(eq(memory.unit, UNIT), eq(memory.active, true)))
    .orderBy(desc(memory.createdAt))
    .limit(200)
  return rows
    .map((row) => {
      const theirs = words(row.requestText)
      let shared = 0
      for (const w of query) if (theirs.has(w)) shared += 1
      const score = shared / query.size + (row.kind === kind ? 0.25 : 0)
      return { row, score }
    })
    .filter((m) => m.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m) => m.row)
}

export const markMemoryUsed = async (db: Executor, id: string): Promise<void> => {
  await db
    .update(memory)
    .set({ timesUsed: sql`${memory.timesUsed} + 1` })
    .where(eq(memory.id, id))
}

export interface NewMemory {
  requestText: string
  text: string
  kind: string
  teamSaid: string
  teamChosen: string | null
  ticketId: string
  patientId: string
  createdBy: string
}

export const saveMemory = async (db: Executor, input: NewMemory): Promise<string> => {
  const id = newId('mem')
  await db.insert(memory).values({ id, unit: UNIT, ...input })
  return id
}
