import type { Fact, StaffMember } from '@bell/core/hospital'
import type { AskPlan, IncomingItem, PatientRequest, Person, Task } from '@bell/core/staff-api'

// Dummy data for the staff video: Priya's shift on 4 West, mostly from the demo seed
// (apps/web/lib/server/staff/seed.ts), plus Mei Chen from the patient video.

export const PRIYA: StaffMember = {
  id: 'st-priya',
  name: 'Priya Raman',
  role: 'nurse',
  roleLabel: 'RN',
  unit: '4 West',
  photoUrl: '/staff/priya.png',
}

const person = (id: string, name: string, roleLabel: string, photoUrl?: string): Person => ({
  id,
  name,
  roleLabel,
  ...(photoUrl ? { photoUrl } : {}),
})

export const PEOPLE = {
  priya: person(PRIYA.id, PRIYA.name, 'RN', PRIYA.photoUrl),
  dana: person('st-dana', 'Dana Kerr', 'Charge nurse'),
  sam: person('st-sam', 'Sam Kim', 'PCT', '/staff/sam.png'),
  lee: person('st-lee', 'Lee Martin', 'Aide', '/staff/lee.png'),
  jo: person('st-jo', 'Jo Turner', 'Aide', '/staff/jo.png'),
  kai: person('st-kai', 'Kai Foster', 'Transport', '/staff/kai.png'),
  ray: person('st-ray', 'Ray Cole', 'Case manager'),
  patel: person('pr-patel', 'Dr. Nina Patel', 'Hospitalist'),
  tech: person('team:tech', 'Tech support', ''),
  pt: person('team:pt', 'Physical therapy', ''),
  interpreter: person('team:interpreter', 'Phone interpreter', ''),
  maintenance: person('team:maintenance', 'Maintenance', ''),
  food: person('team:food', 'Food', ''),
}

/** "n min ago", worked out at render time so the labels never drift during a render. */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

// Incoming. Functions, so `askedAt` is fresh each frame.

export const ruthChest = (): IncomingItem => ({
  id: 'tk-ruth-chest',
  patientId: 'pt-ruth',
  patientName: 'Ruth Okafor',
  roomLabel: 'Room 408, Bed A',
  words: 'My chest feels tight and it’s getting worse.',
  channel: 'voice',
  askedAt: ago(0),
  summary: 'You go in person, Dana Kerr told',
  tier: 'urgent',
  watch: 'Heart history',
  state: 'needs_ok',
  plan: {
    goal: 'Get a nurse to Ruth now, with vitals and an ECG ready.',
    send: [PEOPLE.priya, PEOPLE.dana],
    sendNote: 'Sam brings the vitals machine and ECG cart.',
    tell: {
      text: 'Your nurse Priya is on her way right now. Stay in bed and press the button if it gets worse.',
      channel: 'Room speaker · English',
    },
    watch: 'Page Dr. Patel if you have not confirmed in 2 minutes',
    chart: 'You chart the chest pain in Epic',
    why: 'Chest pain that is getting worse is always urgent. Ruth had a heart attack in 2019 and is on a blood thinner.',
  },
})

const waiting = (): IncomingItem[] => [
  {
    id: 'tk-jorge-bathroom',
    patientId: 'pt-jorge',
    patientName: 'Jorge Reyes',
    roomLabel: 'Room 416, Bed A',
    words: 'I need the bathroom. Nobody came last time.',
    channel: 'voice',
    askedAt: ago(22),
    summary: 'Lee Martin and Sam Kim, with a gait belt',
    tier: 'high',
    watch: 'Fall risk',
    state: 'needs_ok',
    original: {
      language: 'Spanish',
      words: 'Necesito ir al baño. La última vez no vino nadie.',
      translated: true,
    },
    plan: {
      goal: 'Get Jorge to the bathroom safely within 5 minutes.',
      send: [PEOPLE.lee, PEOPLE.sam],
      sendNote: 'Bring a gait belt and his walker. Sam also dries the spill by the sink.',
      tell: {
        text: 'Lee viene en unos 3 minutos. Por favor quédese en la cama.',
        channel: 'Room speaker · Spanish',
      },
      watch: 'Tell you if no one has helped Jorge in 10 minutes',
      chart: 'Lee logs urine output in Epic',
      why: 'Fall risk in Epic, so two people help him stand. Lee is already in Room 416 and Sam has nothing open.',
    },
  },
  {
    id: 'tk-erik-pain',
    patientId: 'pt-erik',
    patientName: 'Erik Lindqvist',
    roomLabel: 'Room 414',
    words: 'My hip is like an eight.',
    channel: 'button',
    askedAt: ago(8),
    summary: 'You bring oxycodone, recheck in 1 hour',
    tier: 'high',
    watch: 'Fall risk',
    state: 'needs_ok',
    plan: {
      goal: 'Treat Erik’s pain within 15 minutes.',
      send: [PEOPLE.priya],
      sendNote: 'Oxycodone 5 mg. Last dose 10:30, the next one is allowed now.',
      tell: {
        text: 'Your nurse is bringing pain medicine in about 10 minutes.',
        channel: 'On his tablet',
      },
      watch: 'Ask Erik his pain again in 1 hour',
      chart: 'You chart the dose and the pain score',
      why: 'Pain 8 of 10 the day after hip surgery, and a dose is allowed now.',
    },
  },
  {
    id: 'tk-ade-scan',
    patientId: 'pt-ade',
    patientName: 'Ade Abara',
    roomLabel: 'Room 420',
    words: 'Is someone taking me to my scan?',
    channel: 'typed',
    askedAt: ago(16),
    summary: 'Kai Foster at 15:30, safety form first',
    tier: 'scheduled',
    watch: 'Nothing by mouth',
    state: 'needs_ok',
    plan: {
      goal: 'Get Ade to MRI at 15:30 with the safety form done.',
      send: [PEOPLE.kai],
      sendNote: 'You finish the MRI safety form before Kai arrives.',
      tell: {
        text: 'Transport is coming at 3:30 for your scan. Your nurse will check a short form first.',
        channel: 'On his tablet',
      },
      watch: 'Tell you if the form is not done by 15:25',
      why: 'MRI is booked for 15:45 and the safety form is still open in Epic.',
    },
  },
  {
    id: 'tk-sami-home',
    patientId: 'pt-sami',
    patientName: 'Sami Haddad',
    roomLabel: 'Room 410',
    words: 'I want to talk to my doctor about going home.',
    channel: 'typed',
    askedAt: ago(35),
    summary: 'Message Dr. Nina Patel',
    tier: 'routine',
    state: 'needs_ok',
    plan: {
      goal: 'Get Dr. Patel to talk with Sami about going home.',
      send: [PEOPLE.patel],
      sendNote: 'The case manager is copied.',
      tell: {
        text: 'Your doctor will come by on rounds around 5 PM to talk about going home.',
        channel: 'On his tablet',
      },
      why: 'Going home questions go to the doctor. Rounds are at 17:00.',
    },
  },
]

/** What Bell sent on its own: Mei's asks from the patient video, and a TV remote. */
const handledByBell = (): IncomingItem[] => [
  {
    id: 'tk-mei-pillow',
    patientId: 'pt-mei',
    patientName: 'Mei Chen',
    roomLabel: 'Room 412, Bed 3',
    words: 'Also, could I have another pillow?',
    channel: 'voice',
    askedAt: ago(1),
    summary: 'Lee Martin brings one',
    tier: 'routine',
    state: 'handled',
    handledNote: 'Bell sent this without asking you: Lee Martin brings one.',
    original: { language: 'Chinese', words: '还有，能再给我一个枕头吗？', translated: true },
    plan: {
      goal: 'Bring Mei another pillow.',
      send: [PEOPLE.lee],
      sendNote: 'Lee is already on the way with her water and blanket.',
      tell: { text: '好的，已经帮您再要一个枕头。', channel: 'On her tablet · Chinese' },
      why: 'A comfort item, not care related, so Bell sent it straight to Lee.',
    },
  },
  {
    id: 'tk-mei-water',
    patientId: 'pt-mei',
    patientName: 'Mei Chen',
    roomLabel: 'Room 412, Bed 3',
    words: 'Could I get some water? And I’m a little cold.',
    channel: 'voice',
    askedAt: ago(2),
    summary: 'Lee Martin, water and a warm blanket',
    tier: 'routine',
    state: 'handled',
    handledNote: 'Bell sent this without asking you: Lee Martin, water and a warm blanket.',
    plan: {
      goal: 'Bring Mei water and a warm blanket.',
      send: [PEOPLE.lee],
      tell: {
        text: 'Of course. I’ve asked for water and a warm blanket.',
        channel: 'On her tablet',
      },
      why: 'Water and a blanket, nothing in her chart against either, so Bell sent them to Lee.',
    },
  },
  {
    id: 'tk-leo-remote',
    patientId: 'pt-leo',
    patientName: 'Leo Brandt',
    roomLabel: 'Room 418',
    words: 'The TV remote isn’t working.',
    channel: 'button',
    askedAt: ago(12),
    summary: 'Sent to Tech support, on the way',
    tier: 'routine',
    state: 'handled',
    handledNote: 'Bell sent this without asking you: Sent to Tech support, on the way.',
    plan: {
      goal: 'Fix Leo’s TV remote.',
      send: [PEOPLE.tech],
      why: 'Not care related, so Bell sent it straight to Tech support.',
    },
  },
]

/** Incoming at a moment of the video. */
export const incomingItems = (opts: { ruth: 'none' | 'new' | 'approved' }): IncomingItem[] => {
  const ruth = ruthChest()
  const extra =
    opts.ruth === 'new'
      ? [ruth]
      : opts.ruth === 'approved'
        ? [{ ...ruth, state: 'handled' as const, handledNote: 'You approved this plan.' }]
        : []
  return [...extra, ...waiting(), ...handledByBell()]
}

/** The About panel: Bell's notes, three chart facts, the patient's other requests. */
export const ABOUT: Record<string, { notes: string; facts: Fact[]; requests: PatientRequest[] }> = {
  'pt-ruth': {
    notes:
      'Day 1 after a left knee replacement. Heart attack in 2019 with a stent, on a blood thinner, so any chest pain needs an ECG and troponin right away. Blood thinner is due at 16:00.',
    facts: [
      { label: 'Allergy', value: 'Penicillin', alert: true },
      { label: 'Code', value: 'Full code' },
      { label: 'Diet', value: 'Heart healthy' },
    ],
    requests: [
      {
        id: 'r-ruth-wash',
        tier: 'routine',
        what: 'Help Ruth wash up',
        who: 'Jo Turner',
        status: 'On hold',
        tone: 'active',
      },
      {
        id: 'r-ruth-lunch',
        tier: 'routine',
        what: 'Lunch menu',
        who: 'Food',
        status: 'Done 13:20',
        tone: 'done',
      },
    ],
  },
  'pt-jorge': {
    notes:
      'Nearly fell getting up alone at 04:30, so the bed alarm is on. Needs two people and a gait belt to stand. Speaks Spanish first. Azithromycin is due at 16:00 and Dr. Patel rounds at 17:00.',
    facts: [
      { label: 'Fall risk', value: 'High, bed alarm on', alert: true },
      { label: 'Language', value: 'Spanish' },
      { label: 'Allergy', value: 'None known' },
    ],
    requests: [
      {
        id: 'r-jorge-interp',
        tier: 'routine',
        what: 'Spanish interpreter',
        who: 'Phone interpreter',
        status: 'On the way',
        tone: 'active',
      },
    ],
  },
  'pt-mei': {
    notes:
      'Day 2 after gallbladder surgery. Low sugar diet and a peanut allergy. Speaks English and Mandarin, and Bell answers her in whichever she uses.',
    facts: [
      { label: 'Allergy', value: 'Peanuts', alert: true },
      { label: 'Diet', value: 'Low sugar' },
      { label: 'Language', value: 'English, Mandarin' },
    ],
    requests: [
      {
        id: 'r-mei-water',
        tier: 'routine',
        what: 'Water and a warm blanket',
        who: 'Lee Martin',
        status: 'On the way',
        tone: 'active',
      },
    ],
  },
}

// Tasks board (Everyone), from the seed. Times are on the canvas clock (~15:14).

const task = (t: Omit<Task, 'mine'> & { mine?: boolean }): Task => ({ mine: false, ...t })

const BOARD: Task[] = [
  task({
    id: 'task-ade-sugar',
    tier: 'high',
    title: 'Blood sugar check',
    patientName: 'Ade Abara',
    room: '420',
    owner: PEOPLE.sam,
    status: 'needs_help',
    timeLabel: 'Since 14:58',
    note: 'Nobody took it in 15 minutes.',
  }),
  task({
    id: 'task-ruth-wash',
    tier: 'routine',
    title: 'Help Ruth wash up',
    patientName: 'Ruth Okafor',
    room: '408A',
    owner: PEOPLE.jo,
    status: 'waiting',
    timeLabel: 'On hold',
    note: 'After her chest pain check.',
  }),
  task({
    id: 'task-sami-tv',
    tier: 'routine',
    title: 'TV won’t turn on',
    patientName: 'Sami Haddad',
    room: '410',
    owner: PEOPLE.tech,
    status: 'waiting',
    timeLabel: 'Waiting since 15:02',
  }),
  task({
    id: 'task-jorge-azithro',
    tier: 'routine',
    title: 'Azithromycin IV',
    patientName: 'Jorge Reyes',
    room: '416A',
    owner: PEOPLE.priya,
    status: 'assigned',
    timeLabel: 'Due 16:00',
    order: 2,
    mine: true,
  }),
  task({
    id: 'task-erik-pt',
    tier: 'routine',
    title: 'Walk with PT',
    patientName: 'Erik Lindqvist',
    room: '414',
    owner: PEOPLE.pt,
    status: 'assigned',
    timeLabel: 'Booked 16:30',
  }),
  task({
    id: 'task-mei-pillow',
    tier: 'routine',
    title: 'Water, blanket and a pillow',
    patientName: 'Mei Chen',
    room: '412-3',
    owner: PEOPLE.lee,
    status: 'in_progress',
    timeLabel: 'Started 15:13',
  }),
  task({
    id: 'task-jorge-interp',
    tier: 'routine',
    title: 'Spanish interpreter',
    patientName: 'Jorge Reyes',
    room: '416A',
    owner: PEOPLE.interpreter,
    status: 'in_progress',
    timeLabel: 'On the way',
  }),
  task({
    id: 'task-erik-cold',
    tier: 'routine',
    title: 'Room too cold',
    patientName: 'Erik Lindqvist',
    room: '414',
    owner: PEOPLE.maintenance,
    status: 'done',
    timeLabel: 'Done 14:20',
  }),
  task({
    id: 'task-morning-meds',
    tier: 'routine',
    title: 'Morning medicines',
    patientName: 'All your patients',
    room: '6 rooms',
    owner: PEOPLE.priya,
    status: 'done',
    timeLabel: 'Done 10:05',
    mine: true,
  }),
]

/** The chest pain check Priya just approved: first in Bell's order for her. */
const RUTH_TASK = task({
  id: 'task-ruth-chest',
  tier: 'urgent',
  title: 'Assess chest pain',
  patientName: 'Ruth Okafor',
  room: '408A',
  owner: PEOPLE.priya,
  status: 'in_progress',
  timeLabel: 'Started 15:14',
  order: 1,
  mine: true,
})

export const SUGAR_TASK = task({
  id: 'task-jorge-sugar',
  tier: 'routine',
  title: 'Blood sugar check',
  patientName: 'Jorge Reyes',
  room: '416A',
  owner: PEOPLE.sam,
  status: 'assigned',
  timeLabel: 'Due 16:00',
})

export const boardTasks = (opts: { meiDone: boolean; sugar: boolean }): Task[] => [
  RUTH_TASK,
  ...BOARD.map((t) =>
    t.id === 'task-mei-pillow' && opts.meiDone
      ? { ...t, status: 'done' as const, timeLabel: 'Done 15:15' }
      : t,
  ),
  ...(opts.sugar ? [SUGAR_TASK] : []),
]

export const ASK_TEXT = 'Have Sam check Jorge’s blood sugar at 4'

export const ASK_PLAN: AskPlan = {
  id: 'ask-sugar',
  title: 'Sam Kim checks Jorge’s blood sugar at 16:00',
  detail: 'Added to Sam’s tasks. Bell reminds him at 15:55 and tells you the result.',
}
