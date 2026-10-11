// Patients: the table rows, the patient dialog (chart from the hospital layer + Bell's notes +
// today's requests), and taking an unassigned patient.

import type { PatientChart, PatientSummary, StaffMember, VitalSeries } from '@bell/core/hospital'
import type { PatientDetail, PatientRequest, PatientRow } from '@bell/core/staff-api'
import { and, desc, eq, gte, ne, or } from 'drizzle-orm'
import { getDb } from '../db'
import { hospital } from '../hospital'
import { events, type TaskRow, type TicketRow, tasks, tickets } from '../schema'
import { loadShift, reviewsFor, type Shift } from './context'
import { logEvents } from './events'
import { patientTickets } from './incoming'
import { isNurseRole } from './people'
import { ensureSeed } from './seed'
import { cancelledTickets, done, type Result, refuse } from './store'
import { taskRequest } from './tasks'
import { errorMessage, TIER_RANK, todayStart } from './util'

const series = (chart: PatientChart | null, kind: VitalSeries['kind']): number[] =>
  chart?.vitals.find((s) => s.kind === kind)?.points.map((p) => p.value) ?? []

/** Open tasks first by how much they need attention. */
const SENT_RANK: Record<TaskRow['status'], number> = {
  needs_help: 0,
  in_progress: 1,
  waiting: 2,
  assigned: 3,
  done: 9,
}

const toRow = (
  patient: PatientSummary,
  chart: PatientChart | null,
  viewer: StaffMember,
  shift: Shift,
  waiting: TicketRow[],
  patientTasks: TaskRow[],
  doneTickets: number,
): PatientRow => {
  const watch = chart?.watch ?? []
  const ask = [...waiting].sort(
    (a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.createdAt.getTime() - b.createdAt.getTime(),
  )[0]
  // "Sent": open requests with someone other than the patient's own nurse.
  const withOthers = patientTasks
    .filter((t) => t.status !== 'done' && t.ownerId !== patient.nurseId)
    .sort(
      (a, b) => SENT_RANK[a.status] - SENT_RANK[b.status] || TIER_RANK[a.tier] - TIER_RANK[b.tier],
    )
  const top = withOthers[0]
  const nurse = patient.nurseId ? shift.staffById.get(patient.nurseId) : undefined
  return {
    patientId: patient.id,
    name: patient.name,
    line: `${patient.location.label} · ${patient.age} ${patient.sex}`,
    mine: !!patient.nurseId && patient.nurseId === viewer.id,
    nurseName: patient.nurseId ? (nurse?.name ?? 'Nurse assigned') : 'No nurse yet',
    canTake: !patient.nurseId && isNurseRole(viewer),
    ...(watch[0] ? { watch: watch[0] } : {}),
    watchMore: Math.max(0, watch.length - 1),
    ...(ask
      ? { ask: { tier: ask.tier, words: ask.words, askedAt: ask.createdAt.toISOString() } }
      : {}),
    ...(top
      ? {
          sent: {
            what: top.title,
            status: taskRequest(top, viewer).status,
            stuck: top.status === 'needs_help',
            more: withOthers.length - 1,
          },
        }
      : {}),
    doneToday: patientTasks.filter((t) => t.status === 'done').length + doneTickets,
    vitals: {
      heartRate: series(chart, 'heart_rate'),
      systolic: series(chart, 'blood_pressure'),
      oxygen: series(chart, 'oxygen'),
    },
  }
}

const todaysPatientWork = async () => {
  const db = await getDb()
  const since = todayStart()
  const [ticketRows, taskRows] = await Promise.all([
    db
      .select()
      .from(tickets)
      .where(or(eq(tickets.state, 'needs_ok'), gte(tickets.createdAt, since))),
    db
      .select()
      .from(tasks)
      .where(or(ne(tasks.status, 'done'), gte(tasks.doneAt, since))),
  ])
  return { ticketRows, taskRows }
}

const buildRows = async (
  viewer: StaffMember,
  shift: Shift,
  patients: PatientSummary[],
): Promise<PatientRow[]> => {
  const [{ ticketRows, taskRows }, charts] = await Promise.all([
    todaysPatientWork(),
    Promise.all(patients.map((p) => hospital().chart(p.id))),
  ])
  const ticketsWithTasks = new Set(taskRows.map((t) => t.ticketId).filter(Boolean))
  const cancelled = await cancelledTickets(await getDb(), ticketRows)
  return patients.map((patient, i) =>
    toRow(
      patient,
      charts[i] ?? null,
      viewer,
      shift,
      ticketRows.filter(
        (t) => t.patientId === patient.id && t.state === 'needs_ok' && !cancelled.has(t.id),
      ),
      taskRows.filter((t) => t.patientId === patient.id),
      ticketRows.filter(
        (t) => t.patientId === patient.id && t.state === 'done' && !ticketsWithTasks.has(t.id),
      ).length,
    ),
  )
}

const rowRank = (row: PatientRow): number =>
  row.ask ? TIER_RANK[row.ask.tier] : row.sent?.stuck ? 2.5 : 9

export const listPatients = async (
  viewer: StaffMember,
  scope: 'mine' | 'floor',
): Promise<PatientRow[]> => {
  await ensureSeed()
  const shift = await loadShift()
  const patients =
    scope === 'mine' ? shift.patients.filter((p) => p.nurseId === viewer.id) : shift.patients
  const rows = await buildRows(viewer, shift, patients)
  return rows.sort(
    (a, b) =>
      (a.mine ? 0 : 10) + rowRank(a) - ((b.mine ? 0 : 10) + rowRank(b)) ||
      a.name.localeCompare(b.name),
  )
}

export const takePatient = async (viewer: StaffMember, id: string): Promise<Result<PatientRow>> => {
  await ensureSeed()
  if (!isNurseRole(viewer)) return refuse(403, 'Only nurses can take a patient')
  const before = await loadShift()
  const patient = before.patientById.get(id)
  if (!patient) return refuse(404, 'Patient not found')
  if (patient.nurseId && patient.nurseId !== viewer.id) {
    const name = before.staffById.get(patient.nurseId)?.name ?? 'another nurse'
    return refuse(409, `${patient.name} already has a nurse: ${name}`)
  }
  if (!patient.nurseId) {
    try {
      await hospital().assignNurse(id, viewer.id)
    } catch (error) {
      return refuse(400, errorMessage(error))
    }
    const db = await getDb()
    await logEvents(db, [{ type: 'patient_taken', actor: viewer.id, patientId: id }])
  }
  const shift = await loadShift()
  const now = shift.patientById.get(id)
  if (!now) return refuse(404, 'Patient not found')
  const [row] = await buildRows(viewer, shift, [now])
  if (!row) return refuse(404, 'Patient not found')
  return done(row)
}

const NEEDS_RANK: Record<PatientRequest['tone'], number> = {
  needs_you: 0,
  stuck: 1,
  active: 2,
  done: 3,
}

/** Bell's notes: the latest note saved for this patient, else a short one from the chart. */
const bellNotes = async (chart: PatientChart, openCount: number): Promise<string> => {
  const db = await getDb()
  const [note] = await db
    .select({ data: events.data })
    .from(events)
    .where(and(eq(events.patientId, chart.patient.id), eq(events.type, 'bell_note')))
    .orderBy(desc(events.createdAt))
    .limit(1)
  const saved = note?.data.text
  if (typeof saved === 'string' && saved) return saved
  const parts = chart.watch.slice(0, 3).map((w) => w.replace(/\.$/, ''))
  if (openCount) parts.push(`${openCount} open request${openCount === 1 ? '' : 's'} today`)
  return parts.length ? `${parts.join('. ')}.` : 'Nothing new from the handoff yet.'
}

export const patientDetail = async (
  viewer: StaffMember,
  id: string,
): Promise<Result<PatientDetail>> => {
  await ensureSeed()
  const [chart, shift] = await Promise.all([hospital().chart(id), loadShift()])
  if (!chart) return refuse(404, 'Patient not found')

  const db = await getDb()
  const since = todayStart()
  const [{ rows: ticketRows, recs, cancelled }, taskRows] = await Promise.all([
    patientTickets(id),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.patientId, id), or(ne(tasks.status, 'done'), gte(tasks.doneAt, since)))),
  ])
  const withTask = new Set(taskRows.map((t) => t.ticketId).filter(Boolean))
  const nurseId = chart.patient.nurseId ?? shift.patientById.get(id)?.nurseId
  const nurseName = nurseId ? (shift.staffById.get(nurseId)?.name ?? 'the nurse') : 'a nurse'

  const fromTickets: PatientRequest[] = ticketRows
    .filter((t) => !withTask.has(t.id))
    .map((t) => {
      const plan = recs.get(t.id)?.plan
      const people = plan?.send ?? []
      const who = people.length
        ? people.map((p) => (p.id === viewer.id ? 'You' : p.name)).join(', ')
        : 'Bell answers'
      if (cancelled.has(t.id)) {
        return {
          id: t.id,
          tier: t.tier,
          what: t.title,
          who,
          status: 'Patient cancelled',
          tone: 'done' as const,
        }
      }
      if (t.state === 'needs_ok') {
        return {
          id: t.id,
          tier: t.tier,
          what: t.title,
          who,
          status: reviewsFor(viewer, shift, t.patientId, t.nurseId)
            ? 'Needs your OK'
            : `Waiting for ${nurseName}`,
          tone: 'needs_you' as const,
        }
      }
      return {
        id: t.id,
        tier: t.tier,
        what: t.title,
        who,
        status: t.state === 'rejected' ? 'Rejected' : people.length ? 'Sent' : 'Bell answered',
        tone: 'done' as const,
      }
    })
  const requests = [...fromTickets, ...taskRows.map((t) => taskRequest(t, viewer))].sort(
    (a, b) => NEEDS_RANK[a.tone] - NEEDS_RANK[b.tone] || TIER_RANK[a.tier] - TIER_RANK[b.tier],
  )
  const open = requests.filter((r) => r.tone !== 'done').length
  return done({ chart, notes: await bellNotes(chart, open), requests })
}
