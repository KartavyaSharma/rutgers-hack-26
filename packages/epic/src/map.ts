// FHIR resources -> the hospital types Bell reads (@bell/core/hospital).
// A real Epic adapter would reuse these on the resources Epic's FHIR API returns.

import type {
  Bed,
  ClinicalNote,
  Fact,
  LabResult,
  Medication,
  PatientChart,
  PatientSummary,
  StaffMember,
  StaffRole,
  VitalSeries,
} from '@bell/core/hospital'
import { codeIn, EXT, LABS, LOCAL, LOINC, ROLE_LABEL, SNOMED, SYS } from './codes'
import type { Encounter, Location, Observation, Patient, PractitionerRole, Reference } from './fhir'
import type { Labels } from './format'
import type { FhirStore } from './store'

const VITALS: {
  kind: VitalSeries['kind']
  code: string
  label: string
  unit: string
  normal: VitalSeries['normal']
}[] = [
  {
    kind: 'heart_rate',
    code: LOINC.heartRate,
    label: 'Heart rate',
    unit: 'bpm',
    normal: { low: 60, high: 100, text: '60–100' },
  },
  {
    kind: 'blood_pressure',
    code: LOINC.bloodPressure,
    label: 'Blood pressure',
    unit: 'mmHg',
    normal: { low: 90, high: 140, text: 'under 140/90' },
  },
  {
    kind: 'oxygen',
    code: LOINC.oxygen,
    label: 'Oxygen',
    unit: '%',
    normal: { low: 92, high: 100, text: '92% and up' },
  },
  {
    kind: 'temperature',
    code: LOINC.temperature,
    label: 'Temperature',
    unit: '°C',
    normal: { low: 36.1, high: 38.0, text: 'under 38.0°' },
  },
]

/** A newly admitted patient shows "Admitted 14:50" as the top watch item for this long. */
const NEW_ADMISSION_MS = 4 * 60 * 60_000
/** A dose counts as due when it is this close (or overdue). */
const DUE_WITHIN_MS = 60 * 60_000

const idOf = (ref: Reference | undefined) => ref?.reference?.split('/')[1]
const lowerFirst = (s: string) =>
  /^[A-Z0-9]{2,}\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1)
/** "COPD, type 2 diabetes, high blood pressure". */
const list = (items: string[]) => items.map((s, i) => (i ? lowerFirst(s) : s)).join(', ')
const time = (iso: string | undefined) => (iso ? Date.parse(iso) : 0)

export function roleOf(role: PractitionerRole): StaffRole | undefined {
  return codeIn(role.code?.[0], SYS.staffRole) as StaffRole | undefined
}

export function toStaffMember(store: FhirStore, role: PractitionerRole): StaffMember | null {
  const id = idOf(role.practitioner)
  const person = id ? store.read('Practitioner', id) : null
  const kind = roleOf(role)
  if (!person || !kind) return null
  const phone = role.telecom?.find((t) => t.system === 'phone')?.value
  const pager = role.telecom?.find((t) => t.system === 'pager')?.value
  const email = person.telecom?.find((t) => t.system === 'email')?.value
  const contact = phone ? `Ext ${phone}` : pager ? `Pager ${pager}` : undefined
  return {
    id: person.id,
    name: person.name?.[0]?.text ?? person.id,
    role: kind,
    roleLabel: ROLE_LABEL[kind],
    ...(role.specialty?.[0]?.text ? { specialty: role.specialty[0].text } : {}),
    unit: role.location?.[0]?.display ?? '',
    ...(person.photo?.[0]?.url ? { photoUrl: person.photo[0].url } : {}),
    ...(contact ? { contact } : {}),
    ...(email ? { email } : {}),
  }
}

/** The active PractitionerRole for a practitioner id. */
export const roleFor = (store: FhirStore, practitionerId: string) =>
  store
    .search('PractitionerRole')
    .find((r) => r.active !== false && idOf(r.practitioner) === practitionerId) ?? null

const currentEncounter = (store: FhirStore, patientId: string): Encounter | undefined =>
  store.search('Encounter', { patient: patientId, status: 'in-progress' })[0]

/** Walks Location.partOf up to the ward. */
function wardOf(store: FhirStore, loc: Location | null): string {
  let at = loc
  for (let i = 0; at && i < 4; i++) {
    if (codeIn(at.physicalType, SYS.locationType) === 'wa') return at.name ?? ''
    const parent = idOf(at.partOf)
    at = parent ? store.read('Location', parent) : null
  }
  return ''
}

function bedOf(loc: Location | null): Bed {
  const room = loc?.identifier?.find((i) => i.system === SYS.room)?.value ?? ''
  const bed = loc?.identifier?.find((i) => i.system === SYS.bed)?.value ?? ''
  // "416A"; a numbered bed reads "412-3" so it is not mistaken for room 4123.
  return { room, bed, label: /^\d+$/.test(bed) ? `${room}-${bed}` : `${room}${bed}` }
}

const ageOf = (birthDate: string | undefined, now: Date) => {
  if (!birthDate) return 0
  const [y = 0, m = 1, d = 1] = birthDate.split('-').map(Number)
  let age = now.getUTCFullYear() - y
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--
  return age
}

/** The assigned nurse and doctor from the patient's active CareTeam. */
export function careTeamIds(store: FhirStore, patientId: string) {
  const team = store.search('CareTeam', { patient: patientId, status: 'active' })[0]
  const member = (role: string) =>
    idOf(team?.participant.find((p) => codeIn(p.role?.[0], SYS.staffRole) === role)?.member)
  return { team, nurseId: member('nurse'), doctorId: member('doctor') }
}

export function toSummary(store: FhirStore, patient: Patient, now: Date): PatientSummary | null {
  const enc = currentEncounter(store, patient.id)
  if (!enc) return null
  const locId = idOf(enc.location?.find((l) => l.status !== 'completed')?.location)
  const loc = locId ? store.read('Location', locId) : null
  const { nurseId, doctorId } = careTeamIds(store, patient.id)
  return {
    id: patient.id,
    name: patient.name?.[0]?.text ?? patient.id,
    age: ageOf(patient.birthDate, now),
    sex: patient.gender === 'female' ? 'F' : 'M',
    location: bedOf(loc),
    unit: wardOf(store, loc),
    ...(nurseId ? { nurseId } : {}),
    ...(doctorId ? { doctorId } : {}),
  }
}

const observation = (store: FhirStore, patientId: string, code: string) =>
  store.search('Observation', { patient: patientId, code }).at(-1)

function facts(store: FhirStore, patient: Patient): Fact[] {
  const pid = patient.id

  const allergies = store.search('AllergyIntolerance', { patient: pid })
  const real = allergies.filter((a) => codeIn(a.code, SYS.snomed) !== SNOMED.noKnownAllergy)
  const allergy: Fact = !allergies.length
    ? { label: 'Allergy', value: 'Not recorded yet' }
    : !real.length
      ? { label: 'Allergy', value: 'None known' }
      : {
          label: 'Allergy',
          value: real
            .map((a) => {
              const reaction = a.reaction?.[0]?.manifestation[0]?.text
              return reaction ? `${a.code.text} (${reaction.toLowerCase()})` : (a.code.text ?? '')
            })
            .join(', '),
          alert: true,
        }

  const codeStatus = observation(store, pid, `${SYS.local}|${LOCAL.codeStatus}`)
  const dnr = codeIn(codeStatus?.valueCodeableConcept, SYS.snomed) === SNOMED.dnr
  const code: Fact = {
    label: 'Code',
    value: codeStatus?.valueCodeableConcept?.text ?? 'Not recorded yet',
    ...(dnr ? { alert: true } : {}),
  }

  const fallObs = observation(store, pid, `${SYS.loinc}|${LOINC.morseFall}`)
  const score = fallObs?.valueInteger
  const level = score === undefined ? '' : score >= 45 ? 'High' : score >= 25 ? 'Medium' : 'Low'
  const fallNote = fallObs?.note?.[0]?.text
  const fall: Fact = {
    label: 'Fall risk',
    value: !level ? 'Not scored yet' : fallNote ? `${level}, ${fallNote}` : level,
  }

  const order = store.search('NutritionOrder', { patient: pid, status: 'active' }).at(-1)
  let diet = 'Not ordered yet'
  if (order?.oralDiet) {
    const o = order.oralDiet
    diet = [o.type?.[0]?.text, ...(o.texture ?? []).map((t) => t.modifier?.text)]
      .filter((s): s is string => !!s)
      .map((s, i) => (i ? s.toLowerCase() : s))
      .join(', ')
    if (o.instruction) diet += ` ${o.instruction}`
    const limit = order.extension?.find((e) => e.url === EXT.fluidLimit)?.valueQuantity?.value
    if (limit !== undefined) {
      const taken =
        observation(store, pid, `${SYS.local}|${LOCAL.fluidIntake}`)?.valueQuantity?.value ?? 0
      diet += `, ${Math.max(0, limit - taken)} mL fluid left`
    }
  }

  const flags = store.search('Flag', { patient: pid, status: 'active' })
  const comm = patient.communication?.find((c) => c.preferred) ?? patient.communication?.[0]
  const hearing = flags.some((f) => codeIn(f.code, SYS.snomed) === SNOMED.hearingLoss)
  const language = comm?.language.text ?? comm?.language.coding?.[0]?.display
  const isolation = flags.find((f) => f.code.coding?.some((c) => c.system === SYS.isolation))

  return [
    allergy,
    code,
    fall,
    { label: 'Diet', value: diet },
    {
      label: 'Language',
      value: language ? (hearing ? `${language}, hard of hearing` : language) : 'Not recorded yet',
    },
    { label: 'Isolation', value: isolation?.code.text ?? 'None' },
  ]
}

function vitals(store: FhirStore, pid: string, t: Labels): VitalSeries[] {
  const all = store
    .search('Observation', { patient: pid, category: 'vital-signs' })
    .sort((a, b) => time(a.effectiveDateTime) - time(b.effectiveDateTime))
  const component = (o: Observation, code: string) =>
    o.component?.find((c) => codeIn(c.code, SYS.loinc) === code)?.valueQuantity?.value
  return VITALS.map((def) => ({
    kind: def.kind,
    label: def.label,
    unit: def.unit,
    normal: def.normal,
    points: all
      .filter((o) => codeIn(o.code, SYS.loinc) === def.code && o.effectiveDateTime)
      .map((o) =>
        def.kind === 'blood_pressure'
          ? {
              time: t.clock(o.effectiveDateTime ?? ''),
              value: component(o, LOINC.systolic) ?? 0,
              value2: component(o, LOINC.diastolic) ?? 0,
            }
          : { time: t.clock(o.effectiveDateTime ?? ''), value: o.valueQuantity?.value ?? 0 },
      ),
  }))
}

function medications(store: FhirStore, pid: string, t: Labels): Medication[] {
  const given = store.search('MedicationAdministration', { patient: pid, status: 'completed' })
  return store
    .search('MedicationRequest', { patient: pid, status: 'active,on-hold' })
    .map((req) => {
      const last = given
        .filter((a) => idOf(a.request) === req.id)
        .sort((a, b) => time(b.effectiveDateTime) - time(a.effectiveDateTime))[0]
      const lastGiven =
        req.status === 'on-hold'
          ? 'held'
          : !last
            ? 'never'
            : t.dayDiff(last.effectiveDateTime) <= -2
              ? 'none today'
              : t.when(last.effectiveDateTime)
      const nextExt = req.extension?.find((e) => e.url === EXT.nextDue)
      const dosage = req.dosageInstruction?.[0]
      let next = dosage?.asNeededBoolean ? 'As needed' : 'Not scheduled'
      let due = false
      if (nextExt?.valueDateTime) {
        const ms = time(nextExt.valueDateTime) - t.now.getTime()
        next = ms <= 0 ? 'now' : t.when(nextExt.valueDateTime)
        due = req.status === 'active' && ms <= DUE_WITHIN_MS
      } else if (nextExt?.valueString) {
        next = nextExt.valueString
      }
      return {
        name: req.medicationCodeableConcept.text ?? '',
        dose: dosage?.text ?? '',
        lastGiven,
        next,
        due,
      }
    })
}

/** "06:00" today, "Yesterday", or "Day 1" counted from admission. */
function dayLabel(
  t: Labels,
  iso: string,
  admitted: string | undefined,
  today: (iso: string) => string,
) {
  const diff = t.dayDiff(iso)
  if (diff === 0) return today(iso)
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return admitted ? `Day ${diff - t.dayDiff(admitted) + 1}` : t.when(iso)
}

function labs(store: FhirStore, pid: string, t: Labels, admitted?: string): LabResult[] {
  return store.search('Observation', { patient: pid, category: 'laboratory' }).map((o) => {
    const loinc = codeIn(o.code, SYS.loinc)
    const info = loinc ? LABS[loinc] : undefined
    const raw = o.valueQuantity?.value
    const value =
      raw === undefined
        ? (o.valueString ?? '')
        : `${info ? raw.toFixed(info.decimals) : raw}${o.valueQuantity?.unit === '%' ? '%' : ''}`
    const interp = codeIn(o.interpretation?.[0], SYS.interpretation)
    const flag =
      interp === 'H' || interp === 'HH'
        ? 'high'
        : interp === 'L' || interp === 'LL'
          ? 'low'
          : undefined
    const normal = o.referenceRange?.[0]?.text
    return {
      name: o.code.text ?? info?.name ?? '',
      value,
      ...(flag ? { flag } : {}),
      ...(normal ? { normal } : {}),
      time: o.effectiveDateTime ? dayLabel(t, o.effectiveDateTime, admitted, t.clock) : '',
    }
  })
}

function tests(store: FhirStore, pid: string, t: Labels, admitted?: string) {
  const done = store.search('DiagnosticReport', { patient: pid }).map((r) => ({
    name: r.code.text ?? '',
    result: r.conclusion ?? 'Pending',
    when: r.effectiveDateTime
      ? dayLabel(t, r.effectiveDateTime, admitted, (iso) => `Today ${t.clock(iso)}`)
      : '',
  }))
  const booked = store.search('ServiceRequest', { patient: pid, status: 'active' }).map((s) => ({
    name: s.code.text ?? '',
    result: s.occurrenceDateTime ? `Booked ${t.clock(s.occurrenceDateTime)}` : 'Ordered',
    when: s.occurrenceDateTime ? dayLabel(t, s.occurrenceDateTime, admitted, () => 'Today') : '',
  }))
  return [...done, ...booked]
}

function notes(store: FhirStore, pid: string, t: Labels): ClinicalNote[] {
  return store.search('DocumentReference', { patient: pid, status: 'current' }).map((d) => {
    const data = d.content[0]?.attachment.data
    const text = data ? Buffer.from(data, 'base64').toString('utf8') : ''
    const at = t.when(d.date)
    const setting = d.context?.practiceSetting?.text
    const author = d.author?.[0]
    const staffId = idOf(author)
    const person = staffId ? store.read('Practitioner', staffId) : null
    if (person) {
      // Someone on the roster: name first, then the service.
      const name = person.name?.[0]?.text ?? ''
      return { author: name, when: setting ? `${setting} · ${at}` : at, text }
    }
    if (author?.display) {
      // A consulting service: the service first, then who wrote it.
      return { author: setting ?? author.display, when: `${author.display} · ${at}`, text }
    }
    return { author: d.type?.text ?? setting ?? 'Note', when: at, text }
  })
}

function history(store: FhirStore, pid: string) {
  const rows: { label: string; value: string }[] = []
  const conditions = store
    .search('Condition', { patient: pid })
    .map((c) => c.code.text ?? '')
    .filter(Boolean)
  if (conditions.length) rows.push({ label: 'Conditions', value: list(conditions) })
  const home = store
    .search('MedicationStatement', { patient: pid, status: 'active' })
    .map((m) => m.medicationCodeableConcept.text ?? '')
    .filter(Boolean)
  if (home.length) rows.push({ label: 'Home meds', value: list(home) })
  const devices = store.search('Device', { patient: pid, status: 'active' })
  const mriForm = observation(store, pid, `${SYS.local}|${LOCAL.mriSafetyForm}`)
  if (devices.length) {
    const mrUnsafe = (s: { coding?: { code?: string }[] }) =>
      s.coding?.some((c) => c.code === 'C113844')
    rows.push({
      label: 'Implants',
      value: list(
        devices.map(
          (d) => `${d.type?.text ?? 'Device'}${d.safety?.some(mrUnsafe) ? ', no MRI' : ''}`,
        ),
      ),
    })
  } else if (mriForm) {
    rows.push({
      label: 'Implants',
      value: mriForm.status === 'final' ? 'None known' : 'None known, MRI form not done',
    })
  }
  const lives = observation(store, pid, `${SYS.local}|${LOCAL.livingSituation}`)?.valueString
  if (lives) rows.push({ label: 'Lives', value: lives })
  return rows
}

function watch(store: FhirStore, pid: string, t: Labels, enc?: Encounter): string[] {
  const rank = (f: { extension?: { url: string; valueInteger?: number }[] }) =>
    f.extension?.find((e) => e.url === EXT.watchRank)?.valueInteger ?? 99
  const items = store
    .search('Flag', { patient: pid, status: 'active' })
    .filter((f) => f.extension?.some((e) => e.url === EXT.watchRank))
    .sort((a, b) => rank(a) - rank(b))
    .map((f) => f.code.text ?? '')
    .filter(Boolean)
  const start = enc?.period?.start
  if (start && t.now.getTime() - time(start) < NEW_ADMISSION_MS) {
    items.unshift(`Admitted ${t.clock(start)}`)
  }
  return items
}

export function toChart(store: FhirStore, patientId: string, t: Labels): PatientChart | null {
  const patient = store.read('Patient', patientId)
  if (!patient) return null
  const summary = toSummary(store, patient, t.now)
  if (!summary) return null
  const enc = currentEncounter(store, patientId)
  const admitted = enc?.period?.start
  const careTeam = [summary.doctorId, summary.nurseId]
    .map((id) => (id ? roleFor(store, id) : null))
    .map((role) => (role ? toStaffMember(store, role) : null))
    .filter((m): m is StaffMember => !!m)
  return {
    patient: summary,
    facts: facts(store, patient),
    careTeam,
    vitals: vitals(store, patientId, t),
    medications: medications(store, patientId, t),
    labs: labs(store, patientId, t, admitted),
    tests: tests(store, patientId, t, admitted),
    notes: notes(store, patientId, t),
    history: history(store, patientId),
    watch: watch(store, patientId, t, enc),
  }
}
