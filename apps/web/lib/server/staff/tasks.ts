// Tasks: work for a person or team after a nurse approves a plan, from Ask Bell, or the shift's rounds.

import type { StaffMember } from '@bell/core/hospital'
import type { PatientRequest, Task, TaskStatus } from '@bell/core/staff-api'
import { and, eq, gte, ne, or } from 'drizzle-orm'
import { type Executor, getDb } from '../db'
import { applyRequestAction } from '../requests'
import { type TaskRow, tasks, tickets } from '../schema'
import { loadShift, reviewsFor } from './context'
import { logEvents } from './events'
import { NOBODY, personOf } from './people'
import { ensureSeed } from './seed'
import { done, type Result, refuse } from './store'
import { clock, errorMessage, MINUTE, TIER_RANK, todayStart } from './util'

export const TASK_STATUSES: readonly TaskStatus[] = [
  'needs_help',
  'waiting',
  'assigned',
  'in_progress',
  'done',
]

const moved = (t: TaskRow): boolean => t.statusAt.getTime() - t.createdAt.getTime() > 2000

/** "Due 16:00", "Since 15:13", "Done 15:09", "Sent by Bell 15:02", "You took it 15:14". */
export const timeLabel = (t: TaskRow, viewer: StaffMember, now = Date.now()): string => {
  const d = t.details
  if (d.timeText) return d.timeText
  const sent =
    t.createdBy === 'bell' ? 'Sent by Bell' : t.createdBy === t.ownerId ? 'Added' : 'Sent'
  switch (t.status) {
    case 'done':
      return `Done ${clock(t.doneAt ?? t.statusAt)}`
    case 'in_progress':
      return `Since ${clock(t.startedAt ?? t.statusAt)}`
    case 'assigned': {
      if (d.takenBy === viewer.id && d.takenAt) return `You took it ${clock(new Date(d.takenAt))}`
      const prefix = d.duePrefix ?? 'Due'
      if (t.dueAt) {
        return t.dueAt.getTime() - now <= 5 * MINUTE
          ? `${prefix} now`
          : `${prefix} ${clock(t.dueAt)}`
      }
      return moved(t) ? `Assigned ${clock(t.statusAt)}` : `${sent} ${clock(t.createdAt)}`
    }
    case 'waiting':
      return moved(t) ? `Waiting since ${clock(t.statusAt)}` : `${sent} ${clock(t.createdAt)}`
    case 'needs_help':
      return moved(t) ? `Flagged ${clock(t.statusAt)}` : `${sent} ${clock(t.createdAt)}`
  }
}

/** Status words for the patient's request list. */
const statusText = (t: TaskRow, viewer: StaffMember): string => {
  const d = t.details
  if (d.statusText) return d.statusText
  switch (t.status) {
    case 'done':
      return `Done ${clock(t.doneAt ?? t.statusAt)}`
    case 'in_progress':
      return t.ownerId === viewer.id ? 'In progress' : 'On the way'
    case 'assigned':
      return t.dueAt ? `${d.duePrefix ?? 'Due'} ${clock(t.dueAt)}` : 'Assigned'
    case 'waiting':
      return d.timeText ?? 'Waiting'
    case 'needs_help':
      return 'Needs help'
  }
}

export const taskRequest = (t: TaskRow, viewer: StaffMember): PatientRequest => ({
  // A task from a ticket keeps the ticket's id, so it matches that IncomingItem.
  id: t.ticketId ?? t.id,
  tier: t.tier,
  what: t.title,
  who: t.ownerId === viewer.id ? 'You' : t.ownerId ? t.owner.name : NOBODY.name,
  status: statusText(t, viewer),
  tone: t.status === 'needs_help' ? 'stuck' : t.status === 'done' ? 'done' : 'active',
})

/** Bell's suggested order for the viewer's assigned tasks: most urgent, then soonest due. */
const bellOrder = (rows: TaskRow[], viewer: StaffMember): Map<string, number> => {
  const mine = rows
    .filter((t) => t.ownerId === viewer.id && t.status === 'assigned')
    .sort(
      (a, b) =>
        TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
        (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )
  return new Map(mine.map((t, i) => [t.id, i + 1]))
}

export const toTask = (t: TaskRow, viewer: StaffMember, order?: number): Task => ({
  id: t.id,
  tier: t.tier,
  title: t.title,
  patientName: t.patientName,
  room: t.room,
  owner: t.ownerId ? t.owner : NOBODY,
  status: t.status,
  timeLabel: timeLabel(t, viewer),
  ...(t.note ? { note: t.note } : {}),
  ...(order ? { order } : {}),
  mine: t.ownerId === viewer.id,
})

/** Open tasks plus the ones finished today. */
const todaysTasks = (db: Executor) =>
  db
    .select()
    .from(tasks)
    .where(or(ne(tasks.status, 'done'), gte(tasks.doneAt, todayStart())))

export const listTasks = async (
  viewer: StaffMember,
  scope: 'mine' | 'everyone',
): Promise<Task[]> => {
  await ensureSeed()
  const db = await getDb()
  const [rows, shift] = await Promise.all([todaysTasks(db), loadShift()])
  const order = bellOrder(rows, viewer)
  const visible =
    scope === 'everyone'
      ? rows
      : rows.filter(
          (t) =>
            t.ownerId === viewer.id ||
            (t.status === 'needs_help' &&
              !!t.patientId &&
              reviewsFor(viewer, shift, t.patientId, null)),
        )
  return visible
    .sort(
      (a, b) =>
        (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99) ||
        TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
        (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0) ||
        b.statusAt.getTime() - a.statusAt.getTime(),
    )
    .map((t) => toTask(t, viewer, order.get(t.id)))
}

/** Keeps the patient's tablet in step: someone is on it, or it is done. Never throws. */
export const syncTabletRequest = async (
  requestId: string | null,
  action: 'seen' | 'claim' | 'done',
): Promise<void> => {
  if (!requestId) return
  try {
    await applyRequestAction(requestId, action)
  } catch (error) {
    console.error(`[staff] could not mark tablet request ${action}:`, errorMessage(error))
  }
}

export const moveTask = async (
  viewer: StaffMember,
  id: string,
  change: { status?: TaskStatus; take?: boolean },
): Promise<Result<Task>> => {
  await ensureSeed()
  const db = await getDb()
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  if (!row) return refuse(404, 'Task not found')

  const now = new Date()
  const status = change.status ?? (change.take && row.status !== 'done' ? 'assigned' : row.status)
  if (change.take && row.ownerId === viewer.id && status === row.status) {
    return done(toTask(row, viewer))
  }
  const statusChanged = status !== row.status
  const details = { ...row.details }
  if (statusChanged) {
    delete details.timeText
    delete details.statusText
  }
  if (change.take) {
    details.takenBy = viewer.id
    details.takenAt = now.toISOString()
  }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({
        status,
        details,
        updatedAt: now,
        ...(change.take ? { ownerId: viewer.id, owner: personOf(viewer) } : {}),
        ...(statusChanged
          ? {
              statusAt: now,
              startedAt: status === 'in_progress' ? (row.startedAt ?? now) : row.startedAt,
              doneAt: status === 'done' ? now : null,
            }
          : {}),
      })
      .where(eq(tasks.id, id))
      .returning()
    if (!updated) throw new Error('Task update returned no row')

    let ticketDone = false
    if (updated.ticketId && statusChanged) {
      const siblings = await tx.select().from(tasks).where(eq(tasks.ticketId, updated.ticketId))
      ticketDone = siblings.every((t) => t.status === 'done')
      await tx
        .update(tickets)
        .set({
          state: ticketDone ? 'done' : 'handled',
          doneAt: ticketDone ? now : null,
          updatedAt: now,
        })
        .where(and(eq(tickets.id, updated.ticketId), ne(tickets.state, 'needs_ok')))
    }
    await logEvents(tx, [
      ...(change.take
        ? [
            {
              type: 'taken' as const,
              actor: viewer.id,
              taskId: id,
              ticketId: updated.ticketId,
              patientId: updated.patientId,
              data: { from: row.ownerId },
            },
          ]
        : []),
      ...(statusChanged
        ? [
            {
              type: status === 'done' ? ('done' as const) : ('moved' as const),
              actor: viewer.id,
              taskId: id,
              ticketId: updated.ticketId,
              patientId: updated.patientId,
              data: { from: row.status, to: status },
            },
          ]
        : []),
    ])
    return { updated, ticketDone }
  })

  if (result.updated.ticketId && statusChanged && (status === 'in_progress' || result.ticketDone)) {
    const [ticket] = await db
      .select({ requestId: tickets.requestId })
      .from(tickets)
      .where(eq(tickets.id, result.updated.ticketId))
    void syncTabletRequest(ticket?.requestId ?? null, result.ticketDone ? 'done' : 'claim')
  }

  return done(await toTaskWithOrder(result.updated, viewer))
}

/** One task for the viewer, with Bell's order among their assigned tasks. */
export const toTaskWithOrder = async (row: TaskRow, viewer: StaffMember): Promise<Task> => {
  const rows = await todaysTasks(await getDb())
  return toTask(row, viewer, bellOrder(rows, viewer).get(row.id))
}
