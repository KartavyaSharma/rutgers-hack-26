// Incoming: each patient request with Bell's plan, for the nurse to approve or reject.
// Approve sends it as tasks. Reject with nothing drops it. Reject with a reason (or a team) saves
// the reason to memory and Bell makes a new plan for the nurse to approve.

import type { StaffMember } from '@bell/core/hospital'
import type { IncomingItem, Person, Plan } from '@bell/core/staff-api'
import { and, eq, gte, or } from 'drizzle-orm'
import { getDb } from '../db'
import { hospital } from '../hospital'
import {
  type RecommendationRow,
  type ReviewRow,
  recommendations,
  reviews,
  type TicketRow,
  tasks,
  tickets,
} from '../schema'
import { loadShift, reviewsFor, type Shift } from './context'
import { logEvents } from './events'
import { saveMemory } from './memory'
import { isTeamId, personOf, teamById } from './people'
import { planTicket } from './planner'
import { ensureSeed } from './seed'
import {
  cancelledTickets,
  done,
  latestRecommendations,
  latestReviews,
  openTasks,
  type Result,
  refuse,
} from './store'
import { syncTabletRequest } from './tasks'
import { languageName } from './translate'
import { bedLabel, newId, roomLabel, TIER_RANK, todayStart } from './util'

const EMPTY_PLAN: Plan = { goal: '', send: [], why: '' }

const handledNote = (
  ticket: TicketRow,
  rec: RecommendationRow | undefined,
  review: ReviewRow | undefined,
  viewer: StaffMember,
  cancelled: boolean,
): string | undefined => {
  if (cancelled) return 'The patient cancelled this request.'
  if (ticket.state === 'needs_ok') return undefined
  if (!review) return `Bell sent this without asking you: ${rec?.summary ?? ticket.title}.`
  const who = review.reviewerId === viewer.id ? 'You' : review.reviewerName
  return review.verdict === 'approve' ? `${who} approved this plan.` : `${who} rejected this plan.`
}

export const toIncomingItem = (
  ticket: TicketRow,
  rec: RecommendationRow | undefined,
  review: ReviewRow | undefined,
  viewer: StaffMember,
  shift: Shift,
  cancelled = false,
): IncomingItem => {
  const note = handledNote(ticket, rec, review, viewer, cancelled)
  const watch = ticket.watch ?? undefined
  return {
    id: ticket.id,
    patientId: ticket.patientId,
    patientName: shift.patientById.get(ticket.patientId)?.name ?? ticket.patientName,
    roomLabel: roomLabel(ticket.roomId, ticket.bed),
    words: ticket.words,
    channel: ticket.channel,
    askedAt: ticket.createdAt.toISOString(),
    summary: rec?.summary ?? ticket.title,
    tier: ticket.tier,
    ...(watch ? { watch } : {}),
    plan: rec?.plan ?? EMPTY_PLAN,
    state: ticket.state === 'needs_ok' && !cancelled ? 'needs_ok' : 'handled',
    ...(note ? { handledNote: note } : {}),
    ...(ticket.details.original && ticket.language
      ? {
          original: {
            language: languageName(ticket.language),
            words: ticket.details.original.text,
            translated: ticket.details.original.translated,
          },
        }
      : {}),
  }
}

/** Everything waiting for the viewer, then what was handled today (newest first). */
export const listIncoming = async (viewer: StaffMember): Promise<IncomingItem[]> => {
  await ensureSeed()
  const db = await getDb()
  const [rows, shift] = await Promise.all([
    db
      .select()
      .from(tickets)
      .where(or(eq(tickets.state, 'needs_ok'), gte(tickets.createdAt, todayStart()))),
    loadShift(),
  ])
  const visible = rows.filter((t) => reviewsFor(viewer, shift, t.patientId, t.nurseId))
  const ids = visible.map((t) => t.id)
  const [recs, revs, cancelled] = await Promise.all([
    latestRecommendations(db, ids),
    latestReviews(db, ids),
    cancelledTickets(db, visible),
  ])
  const isWaiting = (t: TicketRow) => t.state === 'needs_ok' && !cancelled.has(t.id)
  const waiting = visible
    .filter(isWaiting)
    .sort(
      (a, b) =>
        TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.createdAt.getTime() - b.createdAt.getTime(),
    )
  const handled = visible
    .filter((t) => !isWaiting(t))
    .sort((a, b) => (b.decidedAt ?? b.createdAt).getTime() - (a.decidedAt ?? a.createdAt).getTime())
  return [...waiting, ...handled].map((t) =>
    toIncomingItem(t, recs.get(t.id), revs.get(t.id), viewer, shift, cancelled.has(t.id)),
  )
}

const loadForReview = async (
  viewer: StaffMember,
  id: string,
): Promise<Result<{ ticket: TicketRow; rec: RecommendationRow | undefined; shift: Shift }>> => {
  const db = await getDb()
  const [[ticket], shift] = await Promise.all([
    db.select().from(tickets).where(eq(tickets.id, id)).limit(1),
    loadShift(),
  ])
  if (!ticket) return refuse(404, 'Request not found')
  if (!reviewsFor(viewer, shift, ticket.patientId, ticket.nurseId)) {
    return refuse(403, 'Only the patient’s nurse or the charge nurse can decide this')
  }
  if ((await cancelledTickets(db, [ticket])).size) {
    return refuse(409, 'The patient cancelled this request')
  }
  const rec = (await latestRecommendations(db, [id])).get(id)
  return done({ ticket, rec, shift })
}

const itemFor = async (viewer: StaffMember, id: string, shift: Shift): Promise<IncomingItem> => {
  const db = await getDb()
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
  if (!ticket) throw new Error(`Ticket ${id} vanished`)
  const [recs, revs, cancelled] = await Promise.all([
    latestRecommendations(db, [id]),
    latestReviews(db, [id]),
    cancelledTickets(db, [ticket]),
  ])
  return toIncomingItem(ticket, recs.get(id), revs.get(id), viewer, shift, cancelled.has(id))
}

const joinNames = (people: Person[]): string =>
  people.length <= 1
    ? (people[0]?.name ?? '')
    : `${people
        .slice(0, -1)
        .map((p) => p.name)
        .join(', ')} and ${people[people.length - 1]?.name}`

/** The people the nurse kept (sendIds), plus anyone they added by id. */
const chosenPeople = (plan: Plan, sendIds: string[] | undefined, shift: Shift): Person[] => {
  if (!sendIds) return plan.send
  return sendIds.flatMap((id) => {
    const inPlan = plan.send.find((p) => p.id === id)
    if (inPlan) return [inPlan]
    const staff = shift.staffById.get(id)
    if (staff) return [personOf(staff)]
    const team = teamById(id)
    return team ? [team] : []
  })
}

export const approveTicket = async (
  viewer: StaffMember,
  id: string,
  input: { note?: string; sendIds?: string[] },
): Promise<Result<IncomingItem>> => {
  await ensureSeed()
  const loaded = await loadForReview(viewer, id)
  if (!loaded.ok) return loaded
  const { ticket, rec, shift } = loaded.value
  if (ticket.state !== 'needs_ok') {
    if (ticket.state === 'rejected') return refuse(409, 'This request was already rejected')
    return done(await itemFor(viewer, id, shift))
  }

  const plan = rec?.plan ?? EMPTY_PLAN
  const send = chosenPeople(plan, input.sendIds, shift)
  const note = input.note?.trim() || null
  const now = new Date()
  const db = await getDb()

  const approved = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(tickets)
      .set({
        state: send.length ? 'handled' : 'done',
        decidedAt: now,
        doneAt: send.length ? null : now,
        updatedAt: now,
      })
      .where(and(eq(tickets.id, id), eq(tickets.state, 'needs_ok')))
      .returning()
    if (!claimed) return false // someone else decided it a moment ago

    await tx.insert(reviews).values({
      id: newId('rev'),
      ticketId: id,
      recommendationId: rec?.id ?? null,
      reviewerId: viewer.id,
      reviewerName: viewer.name,
      verdict: 'approve',
      note,
      sendIds: input.sendIds ?? null,
    })

    const [owner, ...others] = send
    let taskId: string | null = null
    if (owner) {
      const patientNurse = shift.patientById.get(ticket.patientId)?.nurseId ?? ticket.nurseId
      taskId = newId('task')
      await tx.insert(tasks).values({
        id: taskId,
        ticketId: id,
        patientId: ticket.patientId,
        patientName: ticket.patientName,
        room: bedLabel(ticket.roomId, ticket.bed),
        title: ticket.title,
        tier: ticket.tier,
        ownerId: owner.id,
        owner,
        status: isTeamId(owner.id) ? 'waiting' : 'assigned',
        note:
          note ??
          (owner.id === patientNurse
            ? `“${ticket.words}”`
            : others.length
              ? `With ${joinNames(others)}.`
              : (plan.sendNote ?? null)),
        createdBy: viewer.id,
        // Urgent is due now, high within 15 minutes; the rest has no clock.
        dueAt:
          ticket.tier === 'urgent'
            ? now
            : ticket.tier === 'high'
              ? new Date(now.getTime() + 15 * 60_000)
              : null,
      })
    }
    await logEvents(tx, [
      {
        type: 'approved',
        actor: viewer.id,
        ticketId: id,
        patientId: ticket.patientId,
        data: { recommendationId: rec?.id, note, sendIds: input.sendIds },
      },
      ...(owner
        ? [
            {
              type: 'sent' as const,
              actor: 'bell',
              ticketId: id,
              taskId,
              patientId: ticket.patientId,
              data: { to: send.map((p) => p.id) },
            },
          ]
        : []),
    ])
    return true
  })

  if (!approved) return done(await itemFor(viewer, id, shift))
  void syncTabletRequest(ticket.requestId, send.length ? 'seen' : 'done')
  return done(await itemFor(viewer, id, shift))
}

export const rejectTicket = async (
  viewer: StaffMember,
  id: string,
  input: { team?: string; reason?: string },
): Promise<Result<IncomingItem>> => {
  await ensureSeed()
  const loaded = await loadForReview(viewer, id)
  if (!loaded.ok) return loaded
  const { ticket, rec, shift } = loaded.value
  if (ticket.state !== 'needs_ok') return refuse(409, 'This request was already decided')

  const reason = input.reason?.trim() || undefined
  const team = input.team?.trim() || undefined
  const now = new Date()
  const db = await getDb()

  // Plain reject: nothing else happens.
  if (!reason && !team) {
    const changed = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(tickets)
        .set({ state: 'rejected', decidedAt: now, updatedAt: now })
        .where(and(eq(tickets.id, id), eq(tickets.state, 'needs_ok')))
        .returning()
      if (!claimed) return false
      await tx.insert(reviews).values({
        id: newId('rev'),
        ticketId: id,
        recommendationId: rec?.id ?? null,
        reviewerId: viewer.id,
        reviewerName: viewer.name,
        verdict: 'reject',
      })
      await logEvents(tx, [
        { type: 'rejected', actor: viewer.id, ticketId: id, patientId: ticket.patientId },
      ])
      return true
    })
    if (!changed) return refuse(409, 'This request was already decided')
    void syncTabletRequest(ticket.requestId, 'seen')
    return done(await itemFor(viewer, id, shift))
  }

  // Reject with a reason or team: remember it, then plan again.
  const [teamPart = ticket.team, ...rest] = ticket.kind.split('.')
  const [chart, open] = await Promise.all([hospital().chart(ticket.patientId), openTasks(db)])
  const next = planTicket({
    words: ticket.words,
    title: ticket.title,
    team: teamPart,
    category: ticket.details.category ?? (rest.join('.') || teamPart),
    urgency: ticket.tier === 'urgent' ? 'urgent' : 'routine',
    clinical: ticket.clinical,
    channel: ticket.channel,
    nurseButton: ticket.details.nurseButton ?? false,
    patient: shift.patientById.get(ticket.patientId) ?? chart?.patient ?? null,
    patientName: ticket.patientName,
    room: ticket.roomId,
    bed: ticket.bed,
    chart,
    roster: shift.staff,
    openTasks: open.map((t) => ({ ownerId: t.ownerId, room: t.room })),
    correction: { reason, team, reviewer: viewer },
  })
  const before = rec?.plan.send.map((p) => p.id).join(',') ?? ''
  const after = next.plan.send.map((p) => p.id).join(',')
  const chosen = before !== after ? (next.plan.send[0]?.id ?? 'bell') : null

  const changed = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(tickets)
      .set({ team: next.team, tier: next.tier, updatedAt: now })
      .where(and(eq(tickets.id, id), eq(tickets.state, 'needs_ok')))
      .returning()
    if (!claimed) return false
    const memoryId = await saveMemory(tx, {
      requestText: ticket.words,
      text: reason ?? `Send to ${next.plan.send[0]?.name ?? team}`,
      kind: ticket.kind,
      teamSaid: rec?.team ?? ticket.team,
      teamChosen: chosen,
      ticketId: id,
      patientId: ticket.patientId,
      createdBy: viewer.id,
    })
    await tx.insert(reviews).values({
      id: newId('rev'),
      ticketId: id,
      recommendationId: rec?.id ?? null,
      reviewerId: viewer.id,
      reviewerName: viewer.name,
      verdict: 'reject',
      team: team ?? null,
      reason: reason ?? null,
    })
    const recId = newId('rec')
    await tx.insert(recommendations).values({
      id: recId,
      ticketId: id,
      version: (rec?.version ?? 0) + 1,
      plan: next.plan,
      summary: next.summary,
      team: next.team,
      tier: next.tier,
      source: 'replan',
      facts: next.facts,
      memoryIds: [memoryId],
    })
    await logEvents(tx, [
      {
        type: 'rejected',
        actor: viewer.id,
        ticketId: id,
        patientId: ticket.patientId,
        data: { reason, team },
      },
      { type: 'memory_saved', actor: 'bell', ticketId: id, data: { memoryId } },
      { type: 'recommended', actor: 'bell', ticketId: id, data: { recommendationId: recId } },
    ])
    return true
  })
  if (!changed) return refuse(409, 'This request was already decided')
  return done(await itemFor(viewer, id, shift))
}

/** Tickets for one patient today (any state), with their latest plans. */
export const patientTickets = async (patientId: string) => {
  const db = await getDb()
  const rows = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.patientId, patientId),
        or(eq(tickets.state, 'needs_ok'), gte(tickets.createdAt, todayStart())),
      ),
    )
  const [recs, cancelled] = await Promise.all([
    latestRecommendations(
      db,
      rows.map((t) => t.id),
    ),
    cancelledTickets(db, rows),
  ])
  return { rows, recs, cancelled }
}
