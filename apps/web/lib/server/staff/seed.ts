// Demo shift for 4 West, seeded once when the tickets table is empty. Built from the approved
// canvases (Incoming, Tasks board, patient dialog) so the three views agree: a patient's requests
// = their tickets + tasks. Times are relative to "now" at seed time; the canvases' clock is ~15:14.

import type { Person, Plan, RequestChannel, TaskStatus, Tier } from '@bell/core/staff-api'
import { getDb } from '../db'
import { events, recommendations, tasks, tickets } from '../schema'
import { loadShift } from './context'
import { personOf, TEAMS } from './people'
import type { TaskDetails, TicketState } from './types'
import { bedLabel, MINUTE, newId } from './util'

const CANVAS_NOW = 15 * 60 + 14

// Display snapshots for the plans, used when the hospital roster has no entry yet.
const FALLBACK: Record<string, Person> = {
  'st-priya': {
    id: 'st-priya',
    name: 'Priya Raman',
    roleLabel: 'RN',
    photoUrl: '/staff/priya.png',
  },
  'st-ana': { id: 'st-ana', name: 'Ana Ruiz', roleLabel: 'RN' },
  'st-dana': { id: 'st-dana', name: 'Dana Kerr', roleLabel: 'Charge nurse' },
  'st-sam': { id: 'st-sam', name: 'Sam Kim', roleLabel: 'PCT', photoUrl: '/staff/sam.png' },
  'st-lee': { id: 'st-lee', name: 'Lee Martin', roleLabel: 'Aide', photoUrl: '/staff/lee.png' },
  'st-jo': { id: 'st-jo', name: 'Jo Turner', roleLabel: 'Aide', photoUrl: '/staff/jo.png' },
  'st-kai': {
    id: 'st-kai',
    name: 'Kai Foster',
    roleLabel: 'Transport',
    photoUrl: '/staff/kai.png',
  },
  'st-ray': { id: 'st-ray', name: 'Ray Cole', roleLabel: 'Case manager' },
  'pr-patel': { id: 'pr-patel', name: 'Dr. Nina Patel', roleLabel: 'Hospitalist' },
}

const PATIENTS = {
  jorge: { id: 'pt-jorge', name: 'Jorge Reyes', room: '416', bed: 'A', nurse: 'st-priya' },
  ruth: { id: 'pt-ruth', name: 'Ruth Okafor', room: '412', bed: 'A', nurse: 'st-priya' },
  erik: { id: 'pt-erik', name: 'Erik Lindqvist', room: '414', bed: '', nurse: 'st-priya' },
  ade: { id: 'pt-ade', name: 'Ade Abara', room: '420', bed: '', nurse: 'st-priya' },
  may: { id: 'pt-may', name: 'May Chen', room: '412', bed: 'B', nurse: 'st-priya' },
  sami: { id: 'pt-sami', name: 'Sami Haddad', room: '410', bed: '', nurse: 'st-priya' },
  leo: { id: 'pt-leo', name: 'Leo Brandt', room: '418', bed: '', nurse: 'st-ana' },
  grace: { id: 'pt-grace', name: 'Grace Liu', room: '422', bed: '', nurse: 'st-ana' },
  tom: { id: 'pt-tom', name: 'Tom Price', room: '424', bed: '', nurse: null },
} as const
type PatientKey = keyof typeof PATIENTS

// Bell's notes per patient (from the handoff, Epic and today's requests).
const NOTES: Record<PatientKey, string> = {
  jorge:
    'Nearly fell getting up alone at 04:30, so the bed alarm is on. Needs two people and a gait belt to stand. Speaks Spanish first. Azithromycin is due at 16:00 and Dr. Patel rounds at 17:00.',
  ruth: 'Day 1 after a left knee replacement. Heart attack in 2019 with a stent, on a blood thinner, so any chest pain needs an ECG and troponin right away. Blood thinner is due at 16:00.',
  erik: 'Day 1 after a right hip replacement. Pain went from 4 to 8 since this morning. Last oxycodone at 10:30 and the next dose is allowed now. Physical therapy at 16:30.',
  ade: 'In for headaches and dizziness. Brain MRI at 15:45, with nothing to eat or drink until after. The MRI safety form is not done yet. Transport comes at 15:30.',
  may: 'Heart failure, weight down 0.8 kg since yesterday. Fluid limit 1.5 L a day with 400 mL left. Hard of hearing and DNR. Her daughter is visiting.',
  sami: 'Kidney infection, no fever for 36 hours and switched to pills. Likely going home tomorrow, and the case manager is planning it.',
  leo: 'Day 1 after appendix removal, on clear liquids. Should walk the hall twice today.',
  grace:
    'Foot wound and high blood sugar, 212 at 14:30. Insulin was adjusted this morning. Wound care at 16:30.',
  tom: 'Admitted from the ER at 14:50 with a chest infection. No nurse or admission orders yet.',
}

interface SeedTicket {
  id: string
  pt: PatientKey
  channel: RequestChannel
  channelNote?: string
  minsAgo: number
  words: string
  title: string
  kind: string
  team: string
  tier: Tier
  clinical?: boolean
  watch?: string
  summary: string
  plan: (p: (id: string) => Person) => Plan
  state: TicketState
  /** For handled/done ones: when Bell sent it and when it finished (canvas clock). */
  sentAt?: string
  doneAt?: string
}

const TICKETS: SeedTicket[] = [
  {
    id: 'tk-ruth-chest',
    pt: 'ruth',
    channel: 'voice',
    minsAgo: 2,
    words: 'My chest feels tight and it’s getting worse.',
    title: 'Assess chest pain',
    kind: 'nurse.chest_pain',
    team: 'nurse',
    tier: 'urgent',
    clinical: true,
    watch: 'Heart history',
    summary: 'You go in person, Dana Kerr told',
    state: 'needs_ok',
    plan: (p) => ({
      goal: 'Get a nurse to Ruth now, with vitals and an ECG ready.',
      send: [p('st-priya'), p('st-dana')],
      sendNote: 'Sam brings the vitals machine and ECG cart.',
      tell: {
        text: 'Your nurse Priya is on her way right now. Stay in bed and press the button if it gets worse.',
        channel: 'Room speaker · English',
      },
      watch: 'Page Dr. Patel if you have not confirmed in 2 minutes',
      chart: 'You chart the chest pain in Epic',
      why: 'Chest pain that is getting worse is always urgent. Ruth had a heart attack in 2019 and is on a blood thinner.',
    }),
  },
  {
    id: 'tk-jorge-bathroom',
    pt: 'jorge',
    channel: 'voice',
    minsAgo: 22,
    words: 'I need the bathroom. Nobody came last time.',
    title: 'Bathroom, two people',
    kind: 'care_aide.bathroom',
    team: 'care_aide',
    tier: 'high',
    watch: 'Fall risk',
    summary: 'Lee Martin and Sam Kim, with a gait belt',
    state: 'needs_ok',
    plan: (p) => ({
      goal: 'Get Jorge to the bathroom safely within 5 minutes.',
      send: [p('st-lee'), p('st-sam')],
      sendNote: 'Bring a gait belt and his walker. Sam also dries the spill by the sink.',
      tell: {
        text: 'Lee viene en unos 3 minutos. Por favor quédese en la cama.',
        channel: 'Room speaker · Spanish',
      },
      watch: 'Tell you if no one has helped Jorge in 10 minutes',
      chart: 'Lee logs urine output in Epic',
      why: 'Fall risk in Epic, so two people help him stand. Lee is already in Room 416 and Sam has nothing open.',
    }),
  },
  {
    id: 'tk-erik-pain',
    pt: 'erik',
    channel: 'button',
    channelNote: 'Tapped Pain, then 8 of 10',
    minsAgo: 8,
    words: 'My hip is like an eight.',
    title: 'Pain medicine and recheck',
    kind: 'nurse.pain',
    team: 'nurse',
    tier: 'high',
    clinical: true,
    watch: 'Fall risk',
    summary: 'You bring oxycodone, recheck in 1 hour',
    state: 'needs_ok',
    plan: (p) => ({
      goal: 'Treat Erik’s pain within 15 minutes.',
      send: [p('st-priya')],
      sendNote: 'Oxycodone 5 mg. Last dose 10:30, the next one is allowed now.',
      tell: {
        text: 'Your nurse is bringing pain medicine in about 10 minutes.',
        channel: 'On his tablet',
      },
      watch: 'Ask Erik his pain again in 1 hour',
      chart: 'You chart the dose and the pain score',
      why: 'Pain 8 of 10 the day after hip surgery, and a dose is allowed now.',
    }),
  },
  {
    id: 'tk-ade-scan',
    pt: 'ade',
    channel: 'typed',
    minsAgo: 16,
    words: 'Is someone taking me to my scan?',
    title: 'MRI pickup and safety form',
    kind: 'transport.scan',
    team: 'transport',
    tier: 'scheduled',
    watch: 'Nothing by mouth',
    summary: 'Kai Foster at 15:30, safety form first',
    state: 'needs_ok',
    plan: (p) => ({
      goal: 'Get Ade to MRI at 15:30 with the safety form done.',
      send: [p('st-kai')],
      sendNote: 'You finish the MRI safety form before Kai arrives.',
      tell: {
        text: 'Transport is coming at 3:30 for your scan. Your nurse will check a short form first.',
        channel: 'On his tablet',
      },
      watch: 'Tell you if the form is not done by 15:25',
      why: 'MRI is booked for 15:45 and the safety form is still open in Epic.',
    }),
  },
  {
    id: 'tk-ade-water',
    pt: 'ade',
    channel: 'voice',
    minsAgo: 5,
    words: 'Can I have some water?',
    title: 'Water before the scan',
    kind: 'care_aide.water',
    team: 'nurse',
    tier: 'routine',
    watch: 'Nothing by mouth',
    summary: 'Bell explains why he has to wait',
    state: 'needs_ok',
    plan: () => ({
      goal: 'Explain why Ade can’t drink yet, and offer mouth swabs.',
      send: [],
      sendLine: 'No one. Bell answers Ade.',
      tell: {
        text: 'You can’t drink before your scan. You can have water right after. I can send mouth swabs now.',
        channel: 'Room speaker · English',
      },
      why: 'Epic says nothing by mouth until after the MRI at 15:45.',
    }),
  },
  {
    id: 'tk-may-water',
    pt: 'may',
    channel: 'button',
    channelNote: 'Tapped Water',
    minsAgo: 6,
    words: 'Can I have more water?',
    title: 'Small cup of water',
    kind: 'care_aide.water',
    team: 'care_aide',
    tier: 'routine',
    watch: 'Fluid limit',
    summary: 'Lee Martin, small cup, counts to her limit',
    state: 'needs_ok',
    plan: (p) => ({
      goal: 'Give May a small cup and count it toward her limit.',
      send: [p('st-lee')],
      sendNote: 'A 120 mL cup. She has 400 mL left today.',
      tell: { text: 'Lee is bringing a small cup of water.', channel: 'On her tablet' },
      chart: 'Lee logs 120 mL in Epic',
      why: 'Heart failure with a 1.5 L fluid limit.',
    }),
  },
  {
    id: 'tk-may-blanket',
    pt: 'may',
    channel: 'typed',
    channelNote: 'Her daughter typed',
    minsAgo: 3,
    words: 'Can Mom get another blanket?',
    title: 'Blanket for her daughter',
    kind: 'care_aide.comfort_items',
    team: 'care_aide',
    tier: 'routine',
    summary: 'Jo Turner brings one',
    state: 'needs_ok',
    plan: (p) => ({
      goal: 'Bring May a warm blanket.',
      send: [p('st-jo')],
      tell: { text: 'Jo is bringing a warm blanket.', channel: 'On her tablet' },
      why: 'Simple comfort ask. Jo is on this hall.',
    }),
  },
  {
    id: 'tk-jorge-spill',
    pt: 'jorge',
    channel: 'voice',
    minsAgo: 4,
    words: 'There’s water spilled by the sink.',
    title: 'Dry the spill by the sink',
    kind: 'housekeeping.spill',
    team: 'care_aide',
    tier: 'routine',
    watch: 'Fall risk',
    summary: 'Sam Kim dries it on the same trip',
    state: 'needs_ok',
    plan: (p) => ({
      goal: 'Dry the floor before Jorge walks to the bathroom.',
      send: [p('st-sam')],
      tell: { text: 'Alguien secará el piso en unos minutos.', channel: 'Room speaker · Spanish' },
      why: 'A wet floor next to a fall risk patient. Sam is already going to Room 416.',
    }),
  },
  {
    id: 'tk-sami-home',
    pt: 'sami',
    channel: 'typed',
    minsAgo: 35,
    words: 'I want to talk to my doctor about going home.',
    title: 'Talk to the doctor about going home',
    kind: 'nurse.question',
    team: 'doctor',
    tier: 'routine',
    summary: 'Message Dr. Nina Patel',
    state: 'needs_ok',
    plan: (p) => ({
      goal: 'Get Dr. Patel to talk with Sami about going home.',
      send: [p('pr-patel')],
      sendNote: 'The case manager is copied.',
      tell: {
        text: 'Your doctor will come by on rounds around 5 PM to talk about going home.',
        channel: 'On his tablet',
      },
      why: 'Going home questions go to the doctor. Rounds are at 17:00.',
    }),
  },
  {
    id: 'tk-grace-juice',
    pt: 'grace',
    channel: 'typed',
    minsAgo: 4,
    words: 'Can I get some juice?',
    title: 'Juice',
    kind: 'food.drink',
    team: 'food',
    tier: 'routine',
    watch: 'Diabetic diet',
    summary: 'Food brings sugar-free juice',
    state: 'needs_ok',
    plan: () => ({
      goal: 'Get Grace a drink that fits her diabetic diet.',
      send: [TEAMS.food],
      sendNote: 'Sugar-free juice. Her blood sugar was 212 at 14:30.',
      tell: { text: 'Food is bringing a sugar-free juice.', channel: 'On her tablet' },
      why: 'Diabetic diet in Epic and her blood sugar is high, so Bell picked sugar-free.',
    }),
  },
  {
    id: 'tk-leo-remote',
    pt: 'leo',
    channel: 'button',
    channelNote: 'Tapped TV',
    minsAgo: 12,
    words: 'The TV remote isn’t working.',
    title: 'TV remote',
    kind: 'it.repair_tv',
    team: 'tech',
    tier: 'routine',
    summary: 'Sent to Tech support, on the way',
    state: 'handled',
    plan: () => ({
      goal: 'Fix Leo’s TV remote.',
      send: [TEAMS.tech],
      why: 'Not care related, so Bell sent it straight to Tech support.',
    }),
  },
  {
    id: 'tk-sami-tv',
    pt: 'sami',
    channel: 'button',
    channelNote: 'Tapped TV',
    minsAgo: 12,
    words: 'The TV won’t turn on.',
    title: 'TV won’t turn on',
    kind: 'it.repair_tv',
    team: 'tech',
    tier: 'routine',
    summary: 'Sent to Tech support, waiting',
    state: 'handled',
    plan: () => ({
      goal: 'Get Sami’s TV working.',
      send: [TEAMS.tech],
      why: 'Not care related, so Bell sent it straight to Tech support.',
    }),
  },
  {
    id: 'tk-ruth-lunch',
    pt: 'ruth',
    channel: 'button',
    channelNote: 'Tapped Food',
    minsAgo: 0,
    sentAt: '13:05',
    doneAt: '13:20',
    words: 'Can I get my lunch menu?',
    title: 'Lunch menu',
    kind: 'food.menu',
    team: 'food',
    tier: 'routine',
    summary: 'Sent to Food, done',
    state: 'done',
    plan: () => ({
      goal: 'Send the lunch menu.',
      send: [TEAMS.food],
      why: 'Not care related, so Bell sent it straight to Food.',
    }),
  },
  {
    id: 'tk-erik-cold',
    pt: 'erik',
    channel: 'voice',
    minsAgo: 0,
    sentAt: '14:05',
    doneAt: '14:20',
    words: 'The room is too cold.',
    title: 'Room too cold',
    kind: 'facilities.temperature',
    team: 'maintenance',
    tier: 'routine',
    summary: 'Sent to Maintenance, done',
    state: 'done',
    plan: () => ({
      goal: 'Warm the room.',
      send: [TEAMS.maintenance],
      why: 'Not care related, so Bell sent it straight to Maintenance.',
    }),
  },
]

interface SeedTask {
  id: string
  ticketId?: string
  pt: PatientKey | null
  title: string
  tier: Tier
  owner: string
  status: TaskStatus
  createdAt: string
  statusAt?: string
  dueAt?: string
  doneAt?: string
  note?: string
  createdBy?: string
  details?: TaskDetails
}

// The Tasks board. Cards that duplicate a request still waiting in Incoming are left out:
// those become tasks when the nurse approves them.
const TASKS: SeedTask[] = [
  {
    id: 'task-ade-sugar',
    pt: 'ade',
    title: 'Blood sugar check',
    tier: 'high',
    owner: 'st-sam',
    status: 'needs_help',
    createdAt: '14:58',
    note: 'Nobody took it in 15 minutes.',
    createdBy: 'st-priya',
    details: { statusText: 'Nobody took it' },
  },
  {
    id: 'task-ruth-wash',
    pt: 'ruth',
    title: 'Help Ruth wash up',
    tier: 'routine',
    owner: 'st-jo',
    status: 'waiting',
    createdAt: '15:00',
    note: 'After her chest pain check.',
    createdBy: 'st-priya',
    details: { timeText: 'On hold', statusText: 'On hold' },
  },
  {
    id: 'task-sami-home',
    pt: 'sami',
    title: 'Going home plan',
    tier: 'routine',
    owner: 'st-ray',
    status: 'assigned',
    createdAt: '14:55',
    createdBy: 'st-priya',
    details: { statusText: 'Accepted' },
  },
  {
    id: 'task-jorge-azithro',
    pt: 'jorge',
    title: 'Azithromycin IV',
    tier: 'routine',
    owner: 'st-priya',
    status: 'assigned',
    createdAt: '07:30',
    dueAt: '16:00',
  },
  {
    id: 'task-vitals-round',
    pt: null,
    title: 'Vitals round',
    tier: 'routine',
    owner: 'st-sam',
    status: 'assigned',
    createdAt: '07:30',
    dueAt: '16:00',
  },
  {
    id: 'task-erik-pt',
    pt: 'erik',
    title: 'Walk with PT',
    tier: 'routine',
    owner: 'team:pt',
    status: 'assigned',
    createdAt: '10:30',
    dueAt: '16:30',
    details: { duePrefix: 'Booked' },
  },
  {
    id: 'task-jorge-interp',
    pt: 'jorge',
    title: 'Spanish interpreter',
    tier: 'routine',
    owner: 'team:interpreter',
    status: 'in_progress',
    createdAt: '15:05',
    statusAt: '15:08',
    createdBy: 'st-priya',
    details: { timeText: 'On the way' },
  },
  {
    id: 'task-leo-remote',
    ticketId: 'tk-leo-remote',
    pt: 'leo',
    title: 'TV remote',
    tier: 'routine',
    owner: 'team:tech',
    status: 'in_progress',
    createdAt: '15:02',
    statusAt: '15:06',
    createdBy: 'bell',
    details: { timeText: 'On the way' },
  },
  {
    id: 'task-sami-tv',
    ticketId: 'tk-sami-tv',
    pt: 'sami',
    title: 'TV won’t turn on',
    tier: 'routine',
    owner: 'team:tech',
    status: 'waiting',
    createdAt: '15:02',
    createdBy: 'bell',
  },
  {
    id: 'task-erik-cold',
    ticketId: 'tk-erik-cold',
    pt: 'erik',
    title: 'Room too cold',
    tier: 'routine',
    owner: 'team:maintenance',
    status: 'done',
    createdAt: '14:05',
    doneAt: '14:20',
    createdBy: 'bell',
  },
  {
    id: 'task-ruth-lunch',
    ticketId: 'tk-ruth-lunch',
    pt: 'ruth',
    title: 'Lunch menu',
    tier: 'routine',
    owner: 'team:food',
    status: 'done',
    createdAt: '13:05',
    doneAt: '13:20',
    createdBy: 'bell',
  },
  {
    id: 'task-morning-meds',
    pt: null,
    title: 'Morning medicines',
    tier: 'routine',
    owner: 'st-priya',
    status: 'done',
    createdAt: '07:30',
    doneAt: '10:05',
  },
  {
    id: 'task-jorge-bathroom',
    pt: 'jorge',
    title: 'Bathroom',
    tier: 'routine',
    owner: 'st-lee',
    status: 'done',
    createdAt: '12:28',
    doneAt: '12:40',
    createdBy: 'st-priya',
  },
]

const seedRows = async () => {
  const now = Date.now()
  const at = (hhmm: string): Date => {
    const [h = '0', m = '0'] = hhmm.split(':')
    return new Date(now + (Number(h) * 60 + Number(m) - CANVAS_NOW) * MINUTE)
  }
  const shift = await loadShift()
  const person = (id: string): Person => {
    const staff = shift.staffById.get(id)
    if (staff) return personOf(staff)
    const team = Object.values(TEAMS).find((t) => t.id === id)
    return team ?? FALLBACK[id] ?? { id, name: id, roleLabel: '' }
  }
  const myRooms = Object.values(PATIENTS).filter((p) => p.nurse === 'st-priya').length

  const ticketRows = TICKETS.map((t) => {
    const p = PATIENTS[t.pt]
    const created = t.sentAt && !t.minsAgo ? at(t.sentAt) : new Date(now - t.minsAgo * MINUTE)
    return {
      id: t.id,
      patientId: p.id,
      patientName: p.name,
      roomId: p.room,
      bed: p.bed,
      words: t.words,
      channel: t.channel,
      channelNote: t.channelNote ?? null,
      language: p.id === 'pt-jorge' ? 'es' : 'en',
      title: t.title,
      kind: t.kind,
      team: t.team,
      tier: t.tier,
      clinical: t.clinical ?? false,
      watch: t.watch ?? null,
      state: t.state,
      nurseId: p.nurse,
      details: { category: t.kind.split('.')[1] },
      createdAt: created,
      decidedAt: t.state === 'needs_ok' ? null : created,
      doneAt: t.doneAt ? at(t.doneAt) : null,
      updatedAt: t.doneAt ? at(t.doneAt) : created,
    }
  })
  const recRows = TICKETS.map((t, i) => ({
    id: `rec-${t.id.slice(3)}`,
    ticketId: t.id,
    version: 1,
    plan: t.plan(person),
    summary: t.summary,
    team: t.team,
    tier: t.tier,
    source: 'seed' as const,
    createdAt: ticketRows[i]?.createdAt ?? new Date(now),
  }))
  const taskRows = TASKS.map((k) => {
    const p = k.pt ? PATIENTS[k.pt] : null
    const created = at(k.createdAt)
    const statusAt = k.statusAt ? at(k.statusAt) : k.doneAt ? at(k.doneAt) : created
    return {
      id: k.id,
      ticketId: k.ticketId ?? null,
      patientId: p?.id ?? null,
      patientName: p?.name ?? 'All your patients',
      room: p ? bedLabel(p.room, p.bed) : `${myRooms} rooms`,
      title: k.title,
      tier: k.tier,
      ownerId: k.owner,
      owner: person(k.owner),
      status: k.status,
      note: k.note ?? null,
      createdBy: k.createdBy ?? null,
      details: k.details ?? {},
      dueAt: k.dueAt ? at(k.dueAt) : null,
      statusAt,
      startedAt: k.status === 'in_progress' ? statusAt : null,
      doneAt: k.doneAt ? at(k.doneAt) : null,
      createdAt: created,
      updatedAt: statusAt,
    }
  })
  const eventRows = [
    ...ticketRows.flatMap((t) => [
      {
        id: newId('ev'),
        ticketId: t.id,
        patientId: t.patientId,
        type: 'created' as const,
        actor: 'patient',
        createdAt: t.createdAt,
      },
      {
        id: newId('ev'),
        ticketId: t.id,
        patientId: t.patientId,
        type: 'recommended' as const,
        actor: 'bell',
        createdAt: t.createdAt,
      },
      ...(t.state === 'needs_ok'
        ? []
        : [
            {
              id: newId('ev'),
              ticketId: t.id,
              patientId: t.patientId,
              type: 'sent' as const,
              actor: 'bell',
              createdAt: t.createdAt,
            },
          ]),
    ]),
    ...(Object.keys(NOTES) as PatientKey[]).map((key) => ({
      id: newId('ev'),
      patientId: PATIENTS[key].id,
      type: 'bell_note' as const,
      actor: 'bell',
      data: { text: NOTES[key] },
      createdAt: at('15:00'),
    })),
  ]
  return { ticketRows, recRows, taskRows, eventRows }
}

const seedIfEmpty = async (): Promise<void> => {
  const db = await getDb()
  const [any] = await db.select({ id: tickets.id }).from(tickets).limit(1)
  if (any) return
  const rows = await seedRows()
  await db.transaction(async (tx) => {
    // Re-check inside the transaction so two processes never seed twice.
    const [again] = await tx.select({ id: tickets.id }).from(tickets).limit(1)
    if (again) return
    await tx.insert(tickets).values(rows.ticketRows)
    await tx.insert(recommendations).values(rows.recRows)
    await tx.insert(tasks).values(rows.taskRows)
    await tx.insert(events).values(rows.eventRows)
  })
  console.info('[staff] seeded the 4 West demo shift')
}

const globalForSeed = globalThis as typeof globalThis & { __bellStaffSeed?: Promise<void> }

/** Seeds the demo shift on first use (once per process, and only into an empty tickets table). */
export const ensureSeed = (): Promise<void> => {
  globalForSeed.__bellStaffSeed ??= seedIfEmpty().catch((error: unknown) => {
    globalForSeed.__bellStaffSeed = undefined
    throw error
  })
  return globalForSeed.__bellStaffSeed
}
