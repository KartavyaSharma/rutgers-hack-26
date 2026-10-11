// Bell's rules-based planner: turns a new ticket into a Plan for the nurse to approve, from the
// request's team/category plus facts read from the hospital chart. Safety rules run first
// (nurse button, clinical, infection control); a past correction from memory is only a hint.

import type { PatientChart, PatientSummary, StaffMember } from '@bell/core/hospital'
import type { Person, Plan, RequestChannel, Tier } from '@bell/core/staff-api'
import type { Urgency } from '@bell/core/taxonomy'
import type { MemoryRow } from '../schema'
import { mentionedPeople, SELF_WORDS } from './mentions'
import { isHelper, isTeamId, personOf, TEAM_FOR, TEAMS, type TeamKey, teamById } from './people'
import type { TicketDetails } from './types'
import { capitalize, firstName, roomLabel } from './util'

export interface PlanInput {
  words: string
  title: string
  /** The tablet's or Jev's team and category. */
  team: string
  category: string
  urgency: Urgency
  clinical: boolean
  channel: RequestChannel
  /** The tablet's "I need help immediately" button. */
  nurseButton?: boolean
  patient: PatientSummary | null
  patientName: string
  room: string
  bed: string
  chart: PatientChart | null
  roster: StaffMember[]
  /** Open tasks, to find a helper who is nearby or free. */
  openTasks: { ownerId: string; room: string }[]
  memories?: MemoryRow[]
  /** A nurse's rejection: the reason and/or the team they picked. */
  correction?: { reason?: string; team?: string; reviewer: StaffMember }
}

export interface PlanResult {
  plan: Plan
  summary: string
  team: string
  tier: Tier
  watch: string | null
  facts: string[]
  memoryIds: string[]
  details: TicketDetails
}

type Area =
  | 'nurse_call'
  | 'clinical'
  | 'alarm'
  | 'question'
  | 'doctor'
  | 'water'
  | 'food'
  | 'bathroom'
  | 'mobility'
  | 'comfort'
  | 'spill'
  | 'cleaning'
  | 'tech'
  | 'maintenance'

// Keyword rules over the request's category label, title and words, so the planner keeps working
// when the tablet's catalog ids change. Anything unclear goes to the nurse.
const AREA_WORDS: [Area, RegExp][] = [
  ['alarm', /\b(beep|beeping|alarm|monitor|iv pump|pump|device alarm)\b/],
  ['spill', /\b(spill|spilled|spilt|wet floor|puddle|leak|leaking)\b/],
  ['water', /\b(water|drink|thirsty|ice chips?|juice|coffee|tea|soda)\b/],
  ['food', /\b(food|eat|hungry|snack|meal|lunch|breakfast|dinner|menu|tray)\b/],
  ['cleaning', /\b(clean|cleaning|trash|garbage|dirty|mess|sheets|linens?)\b/],
  ['bathroom', /\b(bathroom|toilet|commode|bedpan|urinal|pee|restroom)\b/],
  ['tech', /\b(tv|remote|wi-?fi|internet|tablet|phone|charger|channel)\b/],
  ['comfort', /\b(blanket|pillow|socks|towel|gown|toothbrush|comfort)\b/],
  ['maintenance', /\b(lights?|cold|hot|temperature|heat|heating|blinds|broken|repair|fix)\b/],
  ['mobility', /\b(sit up|reposition|move|turn over|get up|out of bed|chair|walk)\b/],
]

const TEAM_AREA: Record<string, Area> = {
  food: 'food',
  housekeeping: 'cleaning',
  facilities: 'maintenance',
  it: 'tech',
  care_aide: 'comfort',
}

const areaOf = (input: PlanInput): Area => {
  const text = `${input.category.replace(/[_.]/g, ' ')} ${input.title} ${input.words}`.toLowerCase()
  if (input.nurseButton) return 'nurse_call'
  if (input.clinical || input.urgency === 'urgent') return 'clinical'
  // Medical words always go to the nurse, even when the classifier missed them.
  if (
    /\b(pain|hurts?|chest|breath|breathe|dizzy|bleeding|blood|fell|fall|nause\w*|vomit\w*|fever|medicine|medication|pills?|iv)\b/.test(
      input.words.toLowerCase(),
    )
  )
    return 'clinical'
  const forCareTeam = input.team === 'nurse' || /\b(question|ask)\b/.test(text)
  if (forCareTeam && /\b(doctor|dr\.?|going home|discharge)\b/.test(text)) return 'doctor'
  for (const [area, words] of AREA_WORDS) if (words.test(text)) return area
  return TEAM_AREA[input.team] ?? 'question'
}

const joinNames = (people: Person[]): string => {
  const names = people.map((p) => p.name)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const lowerFirst = (text: string): string =>
  text && !/^[A-Z]{2}/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text

/** The team a person or team id belongs to, for tickets.team. */
export const teamOfPerson = (person: Person, roster: StaffMember[]): string => {
  if (isTeamId(person.id)) return person.id.slice('team:'.length)
  const role = roster.find((s) => s.id === person.id)?.role
  if (role === 'aide' || role === 'pct') return 'care_aide'
  if (role === 'charge_nurse') return 'nurse'
  return role ?? 'nurse'
}

interface Draft {
  goal: string
  send: Person[]
  sendLine?: string
  sendNote?: string
  tell?: string
  watchRow?: string
  chartRow?: string
  why: string
  /** Why these particular people ("Lee is nearby"); dropped when someone else goes instead. */
  whoNote?: string
  summary: string
  tier: Tier
  team: string
  watch?: string | null
  facts?: string[]
  details?: TicketDetails
}

export const planTicket = (input: PlanInput): PlanResult => {
  const { patient, chart, roster } = input
  const first = firstName(input.patientName)
  const his = patient?.sex === 'F' ? 'her' : patient?.sex === 'M' ? 'his' : 'their'
  const him = patient?.sex === 'F' ? 'her' : patient?.sex === 'M' ? 'him' : 'them'
  const place = roomLabel(input.room, input.bed)
  const fact = (label: string): string => chart?.facts.find((f) => f.label === label)?.value ?? ''

  const diet = fact('Diet')
  const npo = /nothing by mouth|\bnpo\b/i.test(diet)
  const fluidLimit = /fluid/i.test(diet)
  const restrictedDiet = !!diet && !/^regular\b/i.test(diet) && !/^not /i.test(diet)
  const fall = fact('Fall risk')
  const fallHigh = /^high/i.test(fall)
  const isolation = fact('Isolation')
  const isolated = !!isolation && !/^(none|no\b|not )/i.test(isolation)
  const language = (fact('Language') || 'English').split(/[ ,]/)[0] ?? 'English'
  const tellChannel = input.channel === 'voice' ? `Room speaker · ${language}` : `On ${his} tablet`
  const topWatch = chart?.watch[0] ?? null

  const nurse = roster.find((s) => s.id === patient?.nurseId) ?? null
  const charge = roster.find((s) => s.role === 'charge_nurse') ?? null
  const nurseOrCharge = nurse ?? charge
  const doctor = roster.find((s) => s.id === patient?.doctorId) ?? null
  const nursePeople = nurseOrCharge ? [personOf(nurseOrCharge)] : []
  const nurseFirst = nurseOrCharge ? firstName(nurseOrCharge.name) : ''
  const you = (p: Person): string => (p.id === nurse?.id ? 'You' : p.name)

  /** Aides and PCTs: someone already going to this room first, then whoever has the least open. */
  const helpers = (count: number, preferPct = false, exclude: string[] = []) =>
    roster
      .filter((s) => isHelper(s) && !exclude.includes(s.id))
      .map((s) => {
        const open = input.openTasks.filter((t) => t.ownerId === s.id)
        return { s, nearby: open.some((t) => t.room.startsWith(input.room)), load: open.length }
      })
      .sort(
        (a, b) =>
          Number(b.nearby) - Number(a.nearby) ||
          (preferPct ? Number(b.s.role === 'pct') - Number(a.s.role === 'pct') : 0) ||
          a.load - b.load,
      )
      .slice(0, count)

  const toNurse = (goal: string, why: string, extra: Partial<Draft> = {}): Draft => ({
    goal,
    send: nursePeople,
    tell: nurseFirst
      ? `Your nurse ${nurseFirst} will come see you soon.`
      : 'A nurse will come see you soon.',
    why,
    summary: nursePeople[0] ? `${you(nursePeople[0])} ${nurse ? 'go' : 'goes'} in person` : '',
    tier: 'routine',
    team: 'nurse',
    watch: topWatch,
    ...extra,
  })

  const area = areaOf(input)
  const draft = ((): Draft => {
    switch (area) {
      case 'nurse_call':
      case 'clinical': {
        const urgent = area === 'nurse_call' || input.urgency === 'urgent'
        const told = urgent && nurse && charge ? charge : null
        const send = told ? [...nursePeople, personOf(told)] : nursePeople
        return toNurse(
          urgent ? `Get a nurse to ${first} now.` : `See ${first} about this soon.`,
          area === 'nurse_call'
            ? 'The patient pressed "I need help immediately", which always goes straight to the nurse.'
            : urgent
              ? 'This sounds urgent and medical, so it goes to the nurse now.'
              : `This sounds medical, so it goes to the nurse.${topWatch ? ` Epic: ${topWatch}.` : ''}`,
          {
            send,
            tier: urgent ? 'urgent' : 'high',
            ...(urgent
              ? {
                  tell: `${nurseFirst ? `Your nurse ${nurseFirst}` : 'A nurse'} is on the way right now. Stay in bed and press the button if it gets worse.`,
                }
              : {}),
            watchRow: urgent
              ? doctor
                ? `Page ${doctor.name} if you have not confirmed in 2 minutes`
                : 'Tell the charge nurse if you have not confirmed in 2 minutes'
              : `Tell you again if no one has seen ${first} in 15 minutes`,
            chartRow: 'You chart it in Epic',
            summary: urgent
              ? `You go in person${told ? `, ${told.name} told` : ''}`
              : `You see ${him} soon`,
          },
        )
      }
      case 'alarm':
        return toNurse(`Check the beeping device in ${place}.`, 'Device alarms go to the nurse.', {
          tier: 'high',
          tell: 'Your nurse is coming to check the beeping.',
          summary: 'You check the device',
        })
      case 'question':
        return toNurse(
          `Answer ${first}’s question.`,
          'Questions for the care team go to the nurse first.',
          {
            tell: 'Your nurse will come by to answer your question.',
            summary: 'You answer it',
          },
        )
      case 'doctor': {
        if (!doctor) {
          return toNurse(`Answer ${first}’s question.`, 'No doctor on file, so the nurse answers.')
        }
        const home = /going home|discharge/i.test(input.words)
        return {
          goal: `Get ${doctor.name} to talk with ${first}.`,
          send: [personOf(doctor)],
          sendNote: home ? 'The case manager is copied.' : undefined,
          tell: 'Your doctor will come by on rounds to talk with you.',
          why: 'Questions for the doctor go to the doctor. You stay in the loop.',
          summary: `Message ${doctor.name}`,
          tier: 'routine',
          team: 'doctor',
          watch: null,
        }
      }
      case 'water':
      case 'food': {
        const drink = area === 'water'
        if (npo) {
          return toNurse(
            `Explain why ${first} can’t ${drink ? 'drink' : 'eat'} yet.`,
            `Epic says ${lowerFirst(diet)}, so the nurse decides.`,
            {
              tell: 'You can’t eat or drink right now. Your nurse is coming to explain.',
              summary: `You explain why ${patient?.sex === 'F' ? 'she has' : patient?.sex === 'M' ? 'he has' : 'they have'} to wait`,
              watch: 'Nothing by mouth',
              facts: [`Diet: ${diet}`],
              details: { diet: { restricted: true, text: diet } },
            },
          )
        }
        if (drink) {
          const [h] = helpers(1)
          if (!h) return toNurse(`Bring ${first} water.`, 'No aide is free right now.')
          const hp = personOf(h.s)
          const hf = firstName(h.s.name)
          if (fluidLimit) {
            return {
              goal: `Give ${first} a small cup and count it toward ${his} limit.`,
              send: [hp],
              sendNote: `A 120 mL cup. Diet in Epic: ${diet}.`,
              tell: `${hf} is bringing a small cup of water.`,
              chartRow: `${hf} logs the amount in Epic`,
              why: `Fluid limit in Epic (${diet}).`,
              summary: `${hp.name}, small cup, counts to ${his} limit`,
              tier: 'routine',
              team: 'care_aide',
              watch: 'Fluid limit',
              facts: [`Diet: ${diet}`],
              details: { diet: { restricted: true, text: diet } },
            }
          }
          return {
            goal: `Bring ${first} water.`,
            send: [hp],
            tell: `${hf} is bringing water.`,
            why: `No fluid limit in Epic${diet ? ` (diet: ${lowerFirst(diet)})` : ''}.`,
            whoNote: h.nearby ? ` ${hf} is nearby.` : undefined,
            summary: `${hp.name} brings it`,
            tier: 'routine',
            team: 'care_aide',
            watch: null,
            facts: diet ? [`Diet: ${diet}`] : [],
            details: { diet: { restricted: false, text: diet } },
          }
        }
        if (restrictedDiet) {
          return toNurse(
            `Check ${first}’s diet before food goes in.`,
            `Diet in Epic is ${lowerFirst(diet)}, so you check first.`,
            {
              sendNote: 'Food brings it once you say what is OK.',
              tell: 'Your nurse will check what you can have.',
              summary: 'You check the diet first',
              watch: chart?.watch.find((w) => /diet|fluid|mouth/i.test(w)) ?? 'Diet',
              facts: [`Diet: ${diet}`],
              details: { diet: { restricted: true, text: diet } },
            },
          )
        }
        return {
          goal: `Get ${first} something to eat.`,
          send: [TEAMS.food],
          tell: 'Food is on the way.',
          why: 'Not care related and no diet limits in Epic, so it goes to Food.',
          summary: 'Sent to Food',
          tier: 'routine',
          team: 'food',
          watch: null,
          facts: diet ? [`Diet: ${diet}`] : [],
          details: { diet: { restricted: false, text: diet } },
        }
      }
      case 'bathroom':
      case 'mobility': {
        const bathroom = area === 'bathroom'
        const picked = helpers(fallHigh ? 2 : 1)
        if (!picked.length) {
          return toNurse(`Help ${first} safely.`, 'No aide is free right now.', {
            tier: fallHigh ? 'high' : 'routine',
          })
        }
        const people = picked.map((h) => personOf(h.s))
        const hf = firstName(people[0]?.name ?? '')
        if (fallHigh) {
          return {
            goal: bathroom
              ? `Get ${first} to the bathroom safely within 5 minutes.`
              : `Help ${first} move safely.`,
            send: people,
            sendNote: 'Bring a gait belt and the walker.',
            tell: `${hf} is coming in about 3 minutes. Please stay in bed.`,
            watchRow: `Tell you if no one has helped ${first} in 10 minutes`,
            why: `Fall risk in Epic (${lowerFirst(fall)}), so two people help ${him}.`,
            summary: `${joinNames(people)}, with a gait belt`,
            tier: 'high',
            team: 'care_aide',
            watch: 'Fall risk',
            facts: [`Fall risk: ${fall}`],
            details: { twoPeople: true },
          }
        }
        return {
          goal: bathroom ? `Help ${first} to the bathroom.` : `Help ${first} sit up or move.`,
          send: people,
          tell: `${hf} is coming to help.`,
          why: fall
            ? `Fall risk in Epic is ${lowerFirst(fall)}, so one person is enough.`
            : 'Hands-on help, so an aide goes.',
          summary: `${joinNames(people)} helps`,
          tier: 'routine',
          team: 'care_aide',
          watch: null,
          facts: fall ? [`Fall risk: ${fall}`] : [],
          details: { twoPeople: false },
        }
      }
      case 'comfort': {
        const [h] = helpers(1)
        if (!h) return toNurse(`Bring ${first} ${lowerFirst(input.title)}.`, 'No aide is free.')
        const hp = personOf(h.s)
        return {
          goal: `Bring ${first} ${lowerFirst(input.title)}.`,
          send: [hp],
          tell: `${firstName(hp.name)} is bringing it.`,
          why: 'Simple comfort ask.',
          whoNote: h.nearby ? ` ${firstName(hp.name)} is nearby.` : undefined,
          summary: `${hp.name} brings it`,
          tier: 'routine',
          team: 'care_aide',
          watch: null,
        }
      }
      case 'spill':
      case 'cleaning': {
        if (isolated || area === 'cleaning') {
          return {
            goal: area === 'spill' ? `Clean up the spill in ${place}.` : `Clean ${place}.`,
            send: [TEAMS.housekeeping],
            sendNote: isolated ? `Disinfecting clean. Isolation in Epic: ${isolation}.` : undefined,
            tell: 'Housekeeping is coming to clean.',
            why: isolated
              ? 'Isolation in Epic, so any mess gets a disinfecting clean from Housekeeping.'
              : 'Not care related, so it goes to Housekeeping.',
            summary: isolated ? 'Housekeeping, disinfecting clean' : 'Sent to Housekeeping',
            tier: fallHigh && area === 'spill' ? 'high' : 'routine',
            team: 'housekeeping',
            watch: isolated ? 'Isolation' : fallHigh ? 'Fall risk' : null,
            facts: isolated ? [`Isolation: ${isolation}`] : [],
            details: { cleaning: { disinfect: isolated } },
          }
        }
        const [h] = helpers(1, true)
        if (!h) return toNurse(`Dry the floor in ${place}.`, 'No aide or PCT is free.')
        const hp = personOf(h.s)
        const hf = firstName(hp.name)
        return {
          goal: `Dry the floor in ${place}${fallHigh ? ` before ${first} walks on it` : ''}.`,
          send: [hp],
          tell: 'Someone will dry the floor in a few minutes.',
          why: `A wet floor is a fall hazard${fallHigh ? ` and ${first} is a high fall risk` : ''}.`,
          whoNote: h.nearby
            ? ` ${hf} is already going to Room ${input.room}.`
            : ` ${hf} has the least open.`,
          summary: h.nearby ? `${hp.name} dries it on the same trip` : `${hp.name} dries it`,
          tier: 'routine',
          team: 'care_aide',
          watch: fallHigh ? 'Fall risk' : null,
          facts: fall ? [`Fall risk: ${fall}`] : [],
          details: { cleaning: { disinfect: false } },
        }
      }
      case 'tech':
      case 'maintenance': {
        const team = area === 'tech' ? TEAMS.tech : TEAMS.maintenance
        return {
          goal: `Sort out ${first}’s request: ${lowerFirst(input.title)}.`,
          send: [team],
          tell: `Someone from ${team.name} is on the way.`,
          why: `Not care related, so it goes to ${team.name}.`,
          summary: `Sent to ${team.name}`,
          tier: 'routine',
          team: area === 'tech' ? 'tech' : 'maintenance',
          watch: null,
        }
      }
    }
  })()

  const memoryIds: string[] = []
  const reviewerId = input.correction?.reviewer.id

  // Point the patient line and the charting line at whoever goes now.
  const retarget = (lead: Person) => {
    const isNurse = lead.id === reviewerId || lead.id === nurse?.id
    if (isTeamId(lead.id)) {
      draft.tell = `Someone from ${lead.name} is on the way.`
      draft.chartRow = undefined
      return
    }
    draft.tell = isNurse
      ? `Your nurse ${firstName(lead.name)} is coming.`
      : `${firstName(lead.name)} is coming.`
    if (draft.chartRow) {
      draft.chartRow = isNurse
        ? 'You chart it in Epic'
        : `${firstName(lead.name)} charts it in Epic`
    }
  }
  const doesIt = (p: Person): string =>
    isTeamId(p.id) ? `Sent to ${p.name}` : you(p) === 'You' ? 'You do it' : `${p.name} does it`

  // A past correction is a hint: it can change who goes, but never away from the nurse on
  // clinical requests (those only get the note).
  // Only a correction about this same patient changes who goes; others are shown as a note.
  const hint = input.memories?.[0]
  if (hint && !input.correction) {
    memoryIds.push(hint.id)
    const target = hint.teamChosen ? resolveTarget(hint.teamChosen, input) : null
    const safe = area !== 'nurse_call' && area !== 'clinical'
    if (target && safe && patient && hint.patientId === patient.id) {
      draft.whoNote = undefined
      draft.send = [target]
      draft.summary = doesIt(target)
      draft.team = teamOfPerson(target, roster)
      retarget(target)
      draft.why = `${draft.why} A nurse corrected this before: “${hint.text}”.`
    } else {
      draft.why = `${draft.why} A nurse said about a similar request: “${hint.text}”.`
    }
  }

  // The nurse rejected the last plan and said why: follow what they said.
  if (input.correction) {
    const { reason = '', team, reviewer } = input.correction
    const nobody = /\b(no one|nobody|not needed|bell (can )?answer)/i.test(reason)
    // Clause by clause, so "Sam is on break, Jo can do it" reads as: Sam out, Jo in.
    const away = /\b(break|busy|off|away|lunch|not here|can['’]?t|cannot|unavailable|tied up)\b/i
    const outIds = new Set<string>()
    const named: Person[] = []
    for (const clause of reason.split(/[,.;!?]|\b(?:but|so|instead)\b/i)) {
      for (const m of mentionedPeople(clause, roster, patient?.doctorId)) {
        if (away.test(clause)) outIds.add(m.person.id)
        else named.push(m.person)
      }
    }
    const pickNamed = named.find((p) => !outIds.has(p.id))
    const target =
      (team && resolveTarget(team, input)) ||
      pickNamed ||
      (SELF_WORDS.test(reason) ? personOf(reviewer) : null)

    if (target || nobody || outIds.size) draft.whoNote = undefined
    if (target) {
      draft.send = [target]
      draft.sendNote = undefined
      draft.team = teamOfPerson(target, roster)
      draft.summary = target.id === reviewer.id ? 'You do it' : doesIt(target)
      retarget(target)
    } else if (nobody) {
      draft.send = []
      draft.goal = `Answer ${first} without sending anyone.`
      draft.sendLine = `No one. Bell answers ${first}.`
      draft.sendNote = undefined
      draft.summary = `Bell answers ${first}`
      draft.chartRow = undefined
    } else if (outIds.size) {
      const kept = draft.send.filter((p) => !outIds.has(p.id))
      const swapCount = draft.send.length - kept.length
      const swap = helpers(swapCount, false, [...outIds, ...kept.map((p) => p.id)]).map((h) =>
        personOf(h.s),
      )
      draft.send = [...kept, ...swap]
      if (!draft.send.length) draft.send = nursePeople
      draft.summary = joinNames(draft.send)
      const lead = draft.send[0]
      if (lead) retarget(lead)
    }
    const quoted = reason ? `You said: “${reason}”.` : `You picked ${draft.send[0]?.name ?? team}.`
    const action = target
      ? `So Bell sends ${target.name}.`
      : nobody
        ? 'So Bell answers the patient itself.'
        : outIds.size
          ? `So Bell sends ${joinNames(draft.send)} instead.`
          : 'Bell kept the plan and noted your reason.'
    // Someone else entirely: the old reasoning no longer applies, keep only the chart facts.
    const facts = draft.facts?.length ? ` Epic: ${draft.facts.join('; ')}.` : ''
    draft.why = target ? `${quoted} ${action}${facts}` : `${quoted} ${action} ${draft.why}`
  }

  const plan: Plan = {
    goal: draft.goal,
    send: draft.send,
    ...(draft.send.length ? {} : { sendLine: draft.sendLine ?? `No one. Bell answers ${first}.` }),
    ...(draft.sendNote ? { sendNote: draft.sendNote } : {}),
    ...(draft.tell ? { tell: { text: draft.tell, channel: tellChannel } } : {}),
    ...(draft.watchRow ? { watch: draft.watchRow } : {}),
    ...(draft.chartRow ? { chart: draft.chartRow } : {}),
    why: `${draft.why}${draft.whoNote ?? ''}`,
  }
  return {
    plan,
    summary: draft.summary || capitalize(draft.goal),
    team: draft.team,
    tier: draft.tier,
    watch: draft.watch ?? null,
    facts: draft.facts ?? [],
    memoryIds,
    details: draft.details ?? {},
  }
}

/** A person or team from an id, a Team value or a label ("care_aide", "Food", "st-jo", "team:food"). */
export const resolveTarget = (value: string, input: PlanInput): Person | null => {
  const { roster, patient } = input
  const v = value.trim()
  const staff = roster.find((s) => s.id === v || s.name.toLowerCase() === v.toLowerCase())
  if (staff) return personOf(staff)
  const team =
    teamById(v) ?? Object.values(TEAMS).find((t) => t.name.toLowerCase() === v.toLowerCase())
  if (team) return team
  const key = v.toLowerCase()
  if (key in TEAMS) return TEAMS[key as TeamKey]
  const mapped = TEAM_FOR[key as keyof typeof TEAM_FOR]
  if (mapped) return TEAMS[mapped]
  if (key === 'nurse') {
    const nurse = roster.find((s) => s.id === patient?.nurseId)
    return nurse ? personOf(nurse) : null
  }
  if (key === 'doctor') {
    const doctor = roster.find((s) => s.id === patient?.doctorId)
    return doctor ? personOf(doctor) : null
  }
  const byRole = roster.find((s) =>
    key === 'care_aide' || key === 'aide' ? isHelper(s) : s.role === key,
  )
  return byRole ? personOf(byRole) : null
}
