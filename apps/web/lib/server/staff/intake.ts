// Tablet -> staff app. Each new patient request becomes a ticket with Bell's first plan, waiting
// for the patient's nurse (never auto-routed). Called fire-and-forget from createRequest.

import type { StaffMember } from '@bell/core/hospital'
import type { RequestChannel } from '@bell/core/staff-api'
import type { CallRequest } from '@bell/core/taxonomy'
import { getDb } from '../db'
import { hospital } from '../hospital'
import { recommendations, tickets } from '../schema'
import { loadShift } from './context'
import { logEvents } from './events'
import { markMemoryUsed, similarMemories } from './memory'
import { planTicket } from './planner'
import { ensureSeed } from './seed'
import { openTasks } from './store'
import { languageOf, translateToEnglish } from './translate'
import { capitalize, errorMessage, newId } from './util'

const CHANNEL: Record<string, RequestChannel> = { typed: 'typed', voice: 'voice' }

// Route reasons where the router fell back to the nurse for safety (the patient heard "nurse notified").
const SAFETY_REASONS = new Set([
  'red_flag',
  'clinical',
  'timeout',
  'rate_limited',
  'invalid_output',
  'error',
])

/** "Patient would like a blanket" -> "A blanket". */
const shortWhat = (summary: string): string =>
  capitalize(
    summary
      .replace(
        /^(the\s+)?patient\s+(would like|wants|needs|is asking for|asks for|asks|has|pressed)\s+/i,
        '',
      )
      .replace(/^["“](.*)["”]$/, '$1')
      .replace(/^(to\s+)/i, '')
      .replace(/\.$/, '')
      .trim(),
  ) || 'Request'

/** Which bed a room's bedside tablet belongs to. The demo tablet in 412 is Maria's, Bed 3. */
const TABLET_BED: Record<string, string> = { '412': '3' }

export const ticketFromRequest = async (request: CallRequest): Promise<string> => {
  await ensureSeed()
  const db = await getDb()
  const shift = await loadShift()
  const patient =
    (await hospital().patientInRoom(request.roomId, TABLET_BED[request.roomId])) ??
    (await hospital().patientInRoom(request.roomId)) ??
    shift.patients.find((p) => p.location.room === request.roomId) ??
    null
  const chart = patient ? await hospital().chart(patient.id) : null
  const nurse: StaffMember | undefined = patient?.nurseId
    ? shift.staffById.get(patient.nurseId)
    : undefined

  let title = shortWhat(request.staffSummary)
  // Typed or spoken words in another language: the nurse reads Bell's English, the original stays one tap away.
  const said = request.text?.trim() ?? ''
  const language = said ? languageOf(said, request.language) : request.language
  const english =
    said && language && language !== 'en' ? await translateToEnglish(said, language) : null
  const original =
    said && language && language !== 'en' ? { text: said, translated: english !== null } : undefined
  const words = english ?? (said || title)
  // The router's summary can quote the patient's own words; staff lists read in English.
  const nonLatin = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u
  if (english && nonLatin.test(title)) title = shortWhat(english)
  const clinical = request.clinical || SAFETY_REASONS.has(request.routeReason ?? '')
  const nurseButton = request.source === 'nurse_button'
  const kind = `${request.team}.${request.category}`
  const channel = CHANNEL[request.source] ?? 'button'
  const memories = await similarMemories(db, words, kind)
  const open = await openTasks(db)

  const result = planTicket({
    words,
    title,
    team: request.team,
    category: request.category,
    urgency: request.urgency,
    clinical,
    channel,
    nurseButton,
    patient,
    patientName: patient?.name ?? `Room ${request.roomId}`,
    room: patient?.location.room ?? request.roomId,
    bed: patient?.location.bed ?? '',
    chart,
    roster: shift.staff,
    openTasks: open.map((t) => ({ ownerId: t.ownerId, room: t.room })),
    memories,
  })

  const ticketId = newId('tk')
  const recId = newId('rec')
  await db.transaction(async (tx) => {
    await tx.insert(tickets).values({
      id: ticketId,
      requestId: request.id,
      patientId: patient?.id ?? '',
      patientName: patient?.name ?? `Room ${request.roomId}`,
      roomId: patient?.location.room ?? request.roomId,
      bed: patient?.location.bed ?? '',
      words,
      channel,
      language,
      title,
      kind,
      team: result.team,
      tier: result.tier,
      clinical,
      watch: result.watch,
      state: 'needs_ok',
      nurseId: nurse?.id ?? null,
      details: {
        ...result.details,
        optionId: request.optionId,
        category: request.category,
        confidence: request.confidence,
        routeReason: request.routeReason,
        ...(nurseButton ? { nurseButton } : {}),
        ...(original ? { original } : {}),
      },
      createdAt: new Date(request.createdAt),
    })
    await tx.insert(recommendations).values({
      id: recId,
      ticketId,
      version: 1,
      plan: result.plan,
      summary: result.summary,
      team: result.team,
      tier: result.tier,
      source: 'rules',
      confidence: request.confidence,
      facts: result.facts,
      memoryIds: result.memoryIds,
    })
    await logEvents(tx, [
      {
        type: 'created',
        actor: 'patient',
        ticketId,
        patientId: patient?.id ?? null,
        data: { requestId: request.id, source: request.source },
      },
      { type: 'recommended', actor: 'bell', ticketId, data: { recommendationId: recId } },
    ])
    for (const id of result.memoryIds) await markMemoryUsed(tx, id)
  })
  return ticketId
}

/** Never throws and never delays the caller: errors are logged, the patient flow carries on. */
export const queueTicket = (request: CallRequest): void => {
  setTimeout(() => {
    ticketFromRequest(request).catch((error: unknown) => {
      console.error(
        '[staff] could not create a ticket for request',
        request.id,
        errorMessage(error),
      )
    })
  }, 0)
}
