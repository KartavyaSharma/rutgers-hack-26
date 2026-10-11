// Ask Bell: the nurse types or says what they want ("Have Sam check May's blood sugar at 4").
// Rules-based for now: Bell finds who, which patient and when, shows "Bell will …", and on
// confirm creates the task. Pending plans live in a small in-memory map for 30 minutes.

import type { StaffMember } from '@bell/core/hospital'
import type { AskPlan, Person, Task, Tier } from '@bell/core/staff-api'
import { getDb } from '../db'
import { tasks } from '../schema'
import { loadShift } from './context'
import { logEvents } from './events'
import { mentionedPatient, mentionedPeople } from './mentions'
import { isTeamId, NOBODY, personOf } from './people'
import { ensureSeed } from './seed'
import { done, openTasks, type Result, refuse } from './store'
import { toTaskWithOrder } from './tasks'
import { bedLabel, capitalize, clock, firstName, MINUTE, newId } from './util'

interface Draft {
  title: string
  patientId: string | null
  patientName: string
  room: string
  owner: Person
  tier: Tier
  note: string | null
  dueAt: Date | null
}

interface Pending {
  staffId: string
  text: string
  plan: AskPlan
  draft: Draft
  expiresAt: number
}

const TTL = 30 * MINUTE
const globalForAsk = globalThis as typeof globalThis & { __bellAskPlans?: Map<string, Pending> }
const pending = (): Map<string, Pending> => {
  globalForAsk.__bellAskPlans ??= new Map()
  const map = globalForAsk.__bellAskPlans
  const now = Date.now()
  for (const [id, p] of map) if (p.expiresAt < now) map.delete(id)
  return map
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Minutes since midnight on the unit's wall clock. */
const wallMinutes = (date: Date): number => {
  const [h = '0', m = '0'] = clock(date).split(':')
  return Number(h) * 60 + Number(m)
}

/** "at 4", "at 4:30pm", "at 16:00", "by 5", "in 20 minutes", "in an hour", "now". */
const parseTime = (text: string, now: Date): { at: Date; match: string } | null => {
  const asap = /\b(right now|now|asap|right away|immediately)\b/i.exec(text)
  const rel = /\bin\s+(\d+|an?|half an)\s*(minutes?|mins?|hours?|hrs?)\b/i.exec(text)
  if (rel) {
    const n = rel[1] === 'half an' ? 0.5 : /^an?$/i.test(rel[1] ?? '') ? 1 : Number(rel[1])
    const minutes = /^h/i.test(rel[2] ?? '') ? n * 60 : n
    return { at: new Date(now.getTime() + minutes * MINUTE), match: rel[0] }
  }
  const abs = /\b(?:at|by|around)\s+(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\W|$)/i.exec(
    text,
  )
  if (abs) {
    let hour = Number(abs[1])
    const minute = Number(abs[2] ?? 0)
    const suffix = abs[3]?.toLowerCase().replace(/\./g, '')
    const current = wallMinutes(now)
    if (suffix === 'pm' && hour < 12) hour += 12
    else if (suffix === 'am') hour %= 12
    else if (!suffix && hour <= 6) hour += 12
    else if (!suffix && hour < 12 && hour * 60 + minute < current) hour += 12
    if (hour > 23 || minute > 59) return null
    let diff = hour * 60 + minute - current
    if (diff < -6 * 60) diff += 24 * 60
    return { at: new Date(now.getTime() + diff * MINUTE), match: abs[0] }
  }
  if (asap) return { at: now, match: asap[0] }
  return null
}

const VERBS = new Set(
  'check bring take give help walk call page change clean dry wipe empty get sit turn move draw start stop hang remove recheck reassess measure weigh feed ask tell set fix order flush swap pick drop finish do make find grab fetch put assist transport collect chart update look see talk visit sit reposition shower wash'.split(
    ' ',
  ),
)
const IRREGULAR: Record<string, string> = { have: 'has', do: 'does', go: 'goes', be: 'is' }

/** "check May’s sugar" -> "checks May’s sugar" for someone other than "You". */
const thirdPerson = (phrase: string): string | null => {
  const [verb = '', ...rest] = phrase.split(' ')
  const v = verb.toLowerCase()
  if (!VERBS.has(v) && !IRREGULAR[v]) return null
  const conj =
    IRREGULAR[v] ??
    (/(s|sh|ch|x|z|o)$/.test(v)
      ? `${v}es`
      : /[^aeiou]y$/.test(v)
        ? `${v.slice(0, -1)}ies`
        : `${v}s`)
  return [conj, ...rest].join(' ')
}

export const askBell = async (viewer: StaffMember, text: string): Promise<Result<AskPlan>> => {
  await ensureSeed()
  const words = text.trim()
  if (!words) return refuse(400, 'Tell Bell what to do')
  const now = new Date()
  const db = await getDb()
  const [shift, open] = await Promise.all([loadShift(), openTasks(db)])

  const patientHit = mentionedPatient(words, shift.patients)
  const roomOnly = patientHit ? null : /\b(?:room\s+)?(\d{3})\b/i.exec(words)
  const inRoom = roomOnly ? shift.patients.filter((p) => p.location.room === roomOnly[1]) : []
  const patient = patientHit?.patient ?? (inRoom.length === 1 ? (inRoom[0] ?? null) : null)
  const mention = mentionedPeople(words, shift.staff, patient?.doctorId).find(
    (m) => !patientHit?.match.includes(m.person.name.split(' ')[0] ?? ''),
  )
  // "I'll call Dr. Patel", "Call Dr. Patel": the nurse does it. "Page Dr. Shah": a message to them.
  const self =
    /^(i'll|i will|i need to|i have to|i should|let me|remind me( to)?|call|phone)\b/i.test(words)
  const message = !self && !!mention && /^(page|message|text)\b/i.test(words)
  const anyone = /\b(anyone|someone|somebody|whoever)\b/i.test(words)
  const owner: Person = self
    ? personOf(viewer)
    : (mention?.person ?? (anyone ? NOBODY : personOf(viewer)))
  const isYou = owner.id === viewer.id
  const time = parseTime(words, now)
  const shortName = (p: Person): string =>
    p.name.startsWith('Dr. ') ? `Dr. ${p.name.split(' ').pop()}` : firstName(p.name)

  // What to do, without the who/when wrapping.
  let action = words.replace(/[.!?]+$/, '')
  action = action.replace(/^(hey bell,?\s+|bell,?\s+|please\s+|can you\s+|could you\s+)+/i, '')
  if (mention && !self) {
    const first = escapeRegex(firstName(mention.person.name))
    const name =
      mention.staff?.role === 'doctor'
        ? `(?:dr\\.?\\s+)?${escapeRegex(mention.person.name.split(' ').pop() ?? '')}`
        : first
    action = action
      .replace(
        new RegExp(`^(have|ask|tell|get|send|let|page|message|text)\\s+${name}\\s+(to\\s+)?`, 'i'),
        '',
      )
      .replace(new RegExp(`^${name}\\s+(should\\s+|can\\s+|will\\s+|to\\s+)?`, 'i'), '')
      .replace(new RegExp(`\\s+(for|to|by)\\s+${name}\\b`, 'i'), '')
  }
  action = action.replace(/^(have|ask|get)\s+(anyone|someone|somebody|whoever)\s+(to\s+)?/i, '')
  action = action.replace(
    /^(i'll|i will|i need to|i have to|i should|let me|remind me to|remind me)\s+/i,
    '',
  )
  if (time) action = action.replace(time.match, '')
  action = action.replace(/\s+/g, ' ').trim()
  if (!action)
    return refuse(
      400,
      'Bell could not tell what to do. Try “Have Sam check May’s blood sugar at 4”.',
    )
  const joiner = (rest: string) => (/^(about|re|regarding|on)\b/i.test(rest) ? ' ' : ': ')
  if (message) action = `message from ${firstName(viewer.name)}${joiner(action)}${action}`

  // The task title drops the patient (the card shows the patient on its own line).
  let taskTitle = action
  if (patientHit) {
    const p = escapeRegex(patientHit.match)
    taskTitle = taskTitle
      .replace(new RegExp(`\\b${p}(’s|'s)\\s+`, 'i'), '')
      .replace(new RegExp(`\\s+(for|to|with|in|on)\\s+(room\\s+)?${p}\\b`, 'i'), '')
      .replace(new RegExp(`\\b${p}\\b\\s*`, 'i'), '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  taskTitle = capitalize(taskTitle || action)

  const asap = time && time.at.getTime() - now.getTime() < MINUTE
  const at = time ? (asap ? ' now' : ` at ${clock(time.at)}`) : ''
  const measured =
    !isYou &&
    /^(check|measure|take|recheck|weigh)\b/i.test(action) &&
    /sugar|glucose|pressure|\bbp\b|temp|vitals|weight|oxygen|pulse|heart rate/i.test(action)
  const ownerLabel = isYou ? 'You' : owner.id ? owner.name : 'Anyone on the unit'
  const verbPhrase = isYou ? (thirdPerson(action) ? action : null) : thirdPerson(action)
  const title = message
    ? `Bell sends ${owner.name} a message${action.replace(/^message from [^\s:]+/, '')}${at}.`
    : verbPhrase
      ? `${ownerLabel} ${verbPhrase}${at}${measured ? ' and tells you the number' : ''}.`
      : `${ownerLabel}: ${action}${at}.`

  // Fold it into a round the owner already has around that time.
  const round =
    owner.id && !isTeamId(owner.id) && time
      ? open.find(
          (t) =>
            t.ownerId === owner.id &&
            /round/i.test(t.title) &&
            t.dueAt &&
            Math.abs(t.dueAt.getTime() - time.at.getTime()) <= 30 * MINUTE,
        )
      : undefined
  const when = time ? (asap ? ' now' : ` for ${clock(time.at)}`) : ''
  const detail = round?.dueAt
    ? `${shortName(owner)} already does the ${clock(round.dueAt)} ${round.title.toLowerCase()}, so Bell adds it there.`
    : !owner.id
      ? 'Bell puts it on the board for anyone to take.'
      : isTeamId(owner.id)
        ? `Bell sends it to ${owner.name}${when}.`
        : isYou
          ? `Bell puts it on your list${when}.`
          : `Bell puts it on ${shortName(owner)}’s list${when}.`

  const unitWide = /\b(all|every|everyone|round)\b/i.test(words)
  const mine = shift.patients.filter((p) => p.nurseId === viewer.id)
  const draft: Draft = {
    title: taskTitle,
    patientId: patient?.id ?? null,
    patientName:
      patient?.name ??
      (roomOnly ? `Room ${roomOnly[1]}` : unitWide ? 'All your patients' : 'No patient named'),
    room: patient
      ? bedLabel(patient.location.room, patient.location.bed)
      : roomOnly
        ? (roomOnly[1] ?? '4 West')
        : unitWide
          ? `${mine.length || shift.patients.length} rooms`
          : '4 West',
    owner,
    tier: /\b(now|asap|urgent|stat|right away|immediately)\b/i.test(words) ? 'high' : 'routine',
    note: round?.dueAt ? `Added to the ${clock(round.dueAt)} ${round.title.toLowerCase()}.` : null,
    dueAt: time?.at ?? null,
  }
  const plan: AskPlan = { id: newId('ask'), title, detail }
  pending().set(plan.id, {
    staffId: viewer.id,
    text: words,
    plan,
    draft,
    expiresAt: Date.now() + TTL,
  })
  await logEvents(db, [
    {
      type: 'instruction',
      actor: viewer.id,
      patientId: draft.patientId,
      data: { text: words, planId: plan.id, title, detail },
    },
  ])
  return done(plan)
}

export const confirmAsk = async (viewer: StaffMember, id: string): Promise<Result<Task>> => {
  await ensureSeed()
  const entry = pending().get(id)
  if (!entry || entry.staffId !== viewer.id) {
    return refuse(404, 'That plan expired. Ask Bell again.')
  }
  pending().delete(id)
  const { draft } = entry
  const db = await getDb()
  const taskId = newId('task')
  const [row] = await db
    .insert(tasks)
    .values({
      id: taskId,
      patientId: draft.patientId,
      patientName: draft.patientName,
      room: draft.room,
      title: draft.title,
      tier: draft.tier,
      ownerId: draft.owner.id,
      owner: draft.owner,
      status: !draft.owner.id || isTeamId(draft.owner.id) ? 'waiting' : 'assigned',
      note: draft.note,
      createdBy: viewer.id,
      dueAt: draft.dueAt,
    })
    .returning()
  if (!row) throw new Error('Task insert returned no row')
  await logEvents(db, [
    {
      type: 'instruction_confirmed',
      actor: viewer.id,
      taskId,
      patientId: draft.patientId,
      data: { planId: id, text: entry.text },
    },
  ])
  return done(await toTaskWithOrder(row, viewer))
}
