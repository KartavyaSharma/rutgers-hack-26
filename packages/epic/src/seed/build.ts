// Turns the patient specs into FHIR R4 resources, with times shifted to the real now.

import { coding, EXT, LABS, LOCAL, LOINC, ROLE_LABEL, SNOMED, SYS } from '../codes'
import type {
  AllergyIntolerance,
  Bundle,
  CareTeam,
  CodeableConcept,
  Condition,
  Device,
  DiagnosticReport,
  DocumentReference,
  Encounter,
  Flag,
  ImagingStudy,
  MedicationAdministration,
  MedicationRequest,
  MedicationStatement,
  NutritionOrder,
  Observation,
  Patient,
  Quantity,
  Reference,
  Resource,
  ServiceRequest,
} from '../fhir'
import { locationId, locationResources } from './locations'
import { PATIENTS, type PatientSpec } from './patients'
import { staffResources } from './staff'
import { type Clock, canvasClock, recent } from './time'

const CONDITION_CODES: Record<string, string> = {
  COPD: '13645005',
  'Type 2 diabetes': '44054006',
  'High blood pressure': '38341003',
  'Heart attack 2019 with stent': '22298006',
  'High cholesterol': '55822004',
  Arthritis: '3723001',
  'Mild kidney disease': '709044004',
  'Kidney disease': '709044004',
  Migraines: '37796009',
  'Sleep apnea': '78275009',
  'Heart failure': '84114007',
  'Atrial fibrillation': '49436004',
  'Kidney stones': '95570007',
  None: SNOMED.noCurrentProblems,
}

const category = (system: string, code: string, display?: string): CodeableConcept[] => [
  { coding: [coding(system, code, display)] },
]
const vitalSigns = category(SYS.obsCategory, 'vital-signs', 'Vital Signs')
const laboratory = category(SYS.obsCategory, 'laboratory', 'Laboratory')
const survey = category(SYS.obsCategory, 'survey', 'Survey')
const socialHistory = category(SYS.obsCategory, 'social-history', 'Social History')

const qty = (value: number, unit: string, code = unit): Quantity => ({
  value,
  unit,
  system: SYS.ucum,
  code,
})
const fixed = (value: number, decimals: number) => value.toFixed(decimals)
const isWhen = (s: string) => /^(?:(?:yesterday|tomorrow|-?\d+d) )?\d{2}:\d{2}$/.test(s)

const birthDate = (age: number, now: Date) => {
  const d = new Date(now)
  d.setUTCFullYear(d.getUTCFullYear() - age)
  d.setUTCDate(d.getUTCDate() - 100)
  return d.toISOString().slice(0, 10)
}

const staffRole = (role: 'nurse' | 'doctor'): CodeableConcept[] => [
  {
    coding: [
      coding(SYS.staffRole, role, ROLE_LABEL[role]),
      role === 'nurse'
        ? coding(SYS.snomed, SNOMED.registeredNurse, 'Registered nurse')
        : coding(SYS.snomed, SNOMED.physician, 'Physician'),
    ],
    text: role === 'nurse' ? 'Nurse' : 'Doctor',
  },
]

function patientResources(p: PatientSpec, index: number, at: Clock, now: Date): Resource[] {
  const key = p.id.replace(/^pt-/, '')
  const name = `${p.given} ${p.family}`
  const subject: Reference = { reference: `Patient/${p.id}`, display: name }
  const encounter: Reference = { reference: `Encounter/enc-${key}` }
  const admitted = at(p.admitted)
  const shiftStart = at('07:00')
  const doctor: Reference = { reference: `Practitioner/${p.doctor}` }
  const nurse: Reference | undefined = p.nurse
    ? { reference: `Practitioner/${p.nurse}` }
    : undefined
  const out: Resource[] = []

  const patient: Patient = {
    resourceType: 'Patient',
    id: p.id,
    active: true,
    identifier: [{ system: SYS.mrn, value: String(40211 + index * 17) }],
    name: [{ text: name, given: [p.given], family: p.family }],
    gender: p.sex,
    birthDate: birthDate(p.age, now),
    communication: [
      {
        language: {
          coding: [coding(SYS.bcp47, p.language[0], p.language[1])],
          text: p.language[1],
        },
        preferred: true,
      },
    ],
  }
  const loc = locationId(p.room, p.bed)
  const enc: Encounter = {
    resourceType: 'Encounter',
    id: `enc-${key}`,
    status: 'in-progress',
    class: coding(SYS.actCode, 'IMP', 'inpatient encounter'),
    subject,
    period: { start: admitted },
    reasonCode: [{ text: p.reason }],
    location: [
      {
        location: {
          reference: `Location/${loc}`,
          display: p.bed ? `Room ${p.room}, Bed ${p.bed}` : `Room ${p.room}`,
        },
        status: 'active',
      },
    ],
    participant: [
      {
        type: category(SYS.participationType, 'ATND', 'attender'),
        individual: doctor,
        period: { start: admitted },
      },
      ...(nurse
        ? [
            {
              type: category(SYS.participationType, 'PART', 'Participation'),
              individual: nurse,
              period: { start: shiftStart },
            },
          ]
        : []),
    ],
  }
  const team: CareTeam = {
    resourceType: 'CareTeam',
    id: `ct-${key}`,
    status: 'active',
    name: 'Care team this shift',
    subject,
    encounter,
    participant: [
      { role: staffRole('doctor'), member: doctor, period: { start: admitted } },
      ...(nurse
        ? [{ role: staffRole('nurse'), member: nurse, period: { start: shiftStart } }]
        : []),
    ],
  }
  out.push(patient, enc, team)

  // Allergies: none recorded yet, "no known allergy", or real ones.
  if (p.allergies) {
    const base = {
      resourceType: 'AllergyIntolerance' as const,
      clinicalStatus: { coding: [coding(SYS.allergyClinical, 'active')] },
      patient: subject,
      recordedDate: admitted,
    }
    if (!p.allergies.length) {
      out.push({
        ...base,
        id: `al-${key}-0`,
        code: {
          coding: [coding(SYS.snomed, SNOMED.noKnownAllergy, 'No known allergy')],
          text: 'None known',
        },
      } satisfies AllergyIntolerance)
    }
    p.allergies.forEach((a, i) => {
      out.push({
        ...base,
        id: `al-${key}-${i}`,
        criticality: 'low',
        category: [a.category ?? 'medication'],
        code: { text: a.substance },
        reaction: [{ manifestation: [{ text: a.reaction }] }],
      } satisfies AllergyIntolerance)
    })
  }

  // Code status and fall risk.
  out.push({
    resourceType: 'Observation',
    id: `obs-${key}-code`,
    status: 'final',
    category: survey,
    code: { coding: [coding(SYS.local, LOCAL.codeStatus, 'Code status')], text: 'Code status' },
    subject,
    encounter,
    effectiveDateTime: admitted,
    valueCodeableConcept: p.dnr
      ? { coding: [coding(SYS.snomed, SNOMED.dnr, 'Not for resuscitation')], text: 'DNR' }
      : { coding: [coding(SYS.snomed, SNOMED.fullCode, 'For resuscitation')], text: 'Full code' },
  } satisfies Observation)
  if (p.fall) {
    out.push({
      resourceType: 'Observation',
      id: `obs-${key}-fall`,
      status: 'final',
      category: survey,
      code: {
        coding: [coding(SYS.loinc, LOINC.morseFall, 'Fall risk total [Morse Fall Scale]')],
        text: 'Fall risk',
      },
      subject,
      encounter,
      effectiveDateTime: at('08:00'),
      valueInteger: p.fall.score,
      ...(p.fall.note ? { note: [{ text: p.fall.note }] } : {}),
    } satisfies Observation)
  }

  // Watch items, in priority order.
  p.watch.forEach(([text, cat, snomed], i) => {
    out.push({
      resourceType: 'Flag',
      id: `flag-${key}-${i}`,
      status: 'active',
      extension: [{ url: EXT.watchRank, valueInteger: i + 1 }],
      category: category(SYS.flagCategory, cat),
      code: snomed ? { coding: [coding(SYS.snomed, snomed)], text } : { text },
      subject,
      period: { start: admitted },
    } satisfies Flag)
  })

  // Diet, NPO and fluid limit.
  if (p.diet) {
    const d = p.diet
    out.push({
      resourceType: 'NutritionOrder',
      id: `diet-${key}`,
      status: 'active',
      intent: 'order',
      patient: subject,
      encounter,
      dateTime: admitted,
      orderer: doctor,
      ...(d.fluidLimitMl
        ? { extension: [{ url: EXT.fluidLimit, valueQuantity: qty(d.fluidLimitMl, 'mL') }] }
        : {}),
      oralDiet: {
        type: [
          d.npo
            ? { coding: [coding(SYS.local, LOCAL.npo, 'NPO')], text: d.type }
            : { text: d.type },
        ],
        ...(d.texture ? { texture: [{ modifier: { text: d.texture } }] } : {}),
        ...(d.instruction ? { instruction: d.instruction } : {}),
      },
      ...(d.note ? { note: [{ text: d.note }] } : {}),
    } satisfies NutritionOrder)
    if (d.fluidTodayMl !== undefined) {
      out.push({
        resourceType: 'Observation',
        id: `obs-${key}-fluid`,
        status: 'final',
        category: survey,
        code: { coding: [coding(SYS.local, LOCAL.fluidIntake)], text: 'Fluid intake today' },
        subject,
        encounter,
        effectiveDateTime: at('14:00'),
        valueQuantity: qty(d.fluidTodayMl, 'mL'),
      } satisfies Observation)
    }
  }

  // Vitals for today.
  const v = p.vitals
  v.times.forEach((t, i) => {
    const time = at(recent(t))
    const vital = (id: string, code: string, display: string, text: string) => ({
      resourceType: 'Observation' as const,
      id: `obs-${key}-${id}-${i}`,
      status: 'final' as const,
      category: vitalSigns,
      code: { coding: [coding(SYS.loinc, code, display)], text },
      subject,
      encounter,
      effectiveDateTime: time,
    })
    out.push(
      {
        ...vital('hr', LOINC.heartRate, 'Heart rate', 'Heart rate'),
        valueQuantity: qty(v.hr[i] ?? 0, 'beats/minute', '/min'),
      },
      {
        ...vital('bp', LOINC.bloodPressure, 'Blood pressure panel', 'Blood pressure'),
        component: [
          {
            code: { coding: [coding(SYS.loinc, LOINC.systolic, 'Systolic blood pressure')] },
            valueQuantity: qty(v.sys[i] ?? 0, 'mmHg', 'mm[Hg]'),
          },
          {
            code: { coding: [coding(SYS.loinc, LOINC.diastolic, 'Diastolic blood pressure')] },
            valueQuantity: qty(v.dia[i] ?? 0, 'mmHg', 'mm[Hg]'),
          },
        ],
      },
      {
        ...vital('o2', LOINC.oxygen, 'Oxygen saturation by Pulse oximetry', 'Oxygen'),
        valueQuantity: qty(v.o2[i] ?? 0, '%'),
      },
      {
        ...vital('temp', LOINC.temperature, 'Body temperature', 'Temperature'),
        valueQuantity: qty(v.t[i] ?? 0, 'C', 'Cel'),
      },
    )
  })

  // Medicine orders and the last dose given.
  p.meds.forEach((m, i) => {
    const med = { text: m.name }
    const next = m.next
      ? isWhen(m.next)
        ? { url: EXT.nextDue, valueDateTime: at(m.next) }
        : { url: EXT.nextDue, valueString: m.next }
      : undefined
    out.push({
      resourceType: 'MedicationRequest',
      id: `mr-${key}-${i}`,
      status: m.last === 'held' ? 'on-hold' : 'active',
      intent: 'order',
      medicationCodeableConcept: med,
      subject,
      encounter,
      authoredOn: admitted,
      requester: doctor,
      dosageInstruction: [{ text: m.dose, ...(m.prn ? { asNeededBoolean: true } : {}) }],
      ...(next ? { extension: [next] } : {}),
    } satisfies MedicationRequest)
    if (m.last && m.last !== 'held') {
      out.push({
        resourceType: 'MedicationAdministration',
        id: `ma-${key}-${i}`,
        status: 'completed',
        medicationCodeableConcept: med,
        subject,
        context: encounter,
        effectiveDateTime: at(m.last),
        request: { reference: `MedicationRequest/mr-${key}-${i}` },
        ...(nurse ? { performer: [{ actor: nurse }] } : {}),
      } satisfies MedicationAdministration)
    }
  })

  // Labs with reference ranges.
  p.labs.forEach((l, i) => {
    const info = LABS[l.code]
    if (!info) throw new Error(`Unknown lab ${l.code}`)
    const unit = info.unit === '%' ? '%' : ''
    const text =
      l.low !== undefined && l.high !== undefined
        ? `${fixed(l.low, info.decimals)}–${fixed(l.high, info.decimals)}`
        : `Under ${fixed(l.high ?? 0, info.decimals)}${unit}`
    const flag =
      l.high !== undefined && l.value > l.high
        ? ['H', 'High']
        : l.low !== undefined && l.value < l.low
          ? ['L', 'Low']
          : ['N', 'Normal']
    out.push({
      resourceType: 'Observation',
      id: `obs-${key}-lab-${i}`,
      status: 'final',
      category: laboratory,
      code: { coding: [coding(SYS.loinc, l.code, info.display)], text: info.name },
      subject,
      encounter,
      effectiveDateTime: at(l.at),
      valueQuantity: qty(l.value, info.unit),
      interpretation: [{ coding: [coding(SYS.interpretation, flag[0] ?? 'N', flag[1])] }],
      referenceRange: [
        {
          ...(l.low !== undefined ? { low: qty(l.low, info.unit) } : {}),
          ...(l.high !== undefined ? { high: qty(l.high, info.unit) } : {}),
          text,
        },
      ],
    } satisfies Observation)
  })

  // Imaging, cultures, ECG; and tests that are booked but not done.
  p.tests.forEach((t, i) => {
    if ('booked' in t) {
      out.push({
        resourceType: 'ServiceRequest',
        id: `sr-${key}-${i}`,
        status: 'active',
        intent: 'order',
        category: category(SYS.snomed, '363679005', 'Imaging'),
        code: { text: t.name },
        subject,
        encounter,
        occurrenceDateTime: at(t.booked),
        requester: doctor,
      } satisfies ServiceRequest)
      return
    }
    const when = at(t.at)
    const report: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: `dr-${key}-${i}`,
      status: 'final',
      category: category(SYS.diagnosticService, t.service),
      code: { text: t.name },
      subject,
      encounter,
      effectiveDateTime: when,
      issued: when,
      conclusion: t.result,
    }
    if (t.service === 'RAD') {
      const modality = /MRI/.test(t.name) ? 'MR' : /CT/.test(t.name) ? 'CT' : 'DX'
      const study: ImagingStudy = {
        resourceType: 'ImagingStudy',
        id: `img-${key}-${i}`,
        status: 'available',
        subject,
        encounter,
        started: when,
        modality: [coding(SYS.dicom, modality)],
        description: t.name,
      }
      report.imagingStudy = [{ reference: `ImagingStudy/${study.id}` }]
      out.push(study)
    }
    out.push(report)
  })

  // Doctor and team notes.
  p.notes.forEach((n, i) => {
    const type =
      n.kind === 'ed'
        ? { coding: [coding(SYS.loinc, LOINC.edNote, 'Emergency department note')], text: n.title }
        : n.kind === 'consult'
          ? { coding: [coding(SYS.loinc, LOINC.consultNote, 'Consult note')], text: 'Consult note' }
          : {
              coding: [coding(SYS.loinc, LOINC.progressNote, 'Progress note')],
              text: 'Progress note',
            }
    const author: Reference[] = n.by
      ? [{ reference: `Practitioner/${n.by}` }]
      : n.name
        ? [{ display: n.name }]
        : []
    out.push({
      resourceType: 'DocumentReference',
      id: `doc-${key}-${i}`,
      status: 'current',
      docStatus: 'final',
      type,
      category: category(SYS.docCategory, 'clinical-note', 'Clinical Note'),
      subject,
      date: at(n.at),
      ...(author.length ? { author } : {}),
      content: [
        {
          attachment: {
            contentType: 'text/plain; charset=utf-8',
            data: Buffer.from(n.text, 'utf8').toString('base64'),
          },
        },
      ],
      context: {
        encounter: [encounter],
        ...(n.setting ? { practiceSetting: { text: n.setting } } : {}),
      },
    } satisfies DocumentReference)
  })

  // History: problem list, home medicines, implants, living situation.
  p.conditions.forEach((text, i) => {
    const code = CONDITION_CODES[text]
    out.push({
      resourceType: 'Condition',
      id: `cond-${key}-${i}`,
      clinicalStatus: { coding: [coding(SYS.conditionClinical, 'active')] },
      category: category(SYS.conditionCategory, 'problem-list-item', 'Problem List Item'),
      code: code ? { coding: [coding(SYS.snomed, code)], text } : { text },
      subject,
    } satisfies Condition)
  })
  p.homeMeds?.forEach((text, i) => {
    out.push({
      resourceType: 'MedicationStatement',
      id: `ms-${key}-${i}`,
      status: 'active',
      category: { coding: [coding(SYS.medStatementCategory, 'community', 'Community')] },
      medicationCodeableConcept: { text },
      subject,
    } satisfies MedicationStatement)
  })
  if (p.implants?.device) {
    out.push({
      resourceType: 'Device',
      id: `dev-${key}`,
      status: 'active',
      type: { text: p.implants.device },
      ...(p.implants.mrUnsafe
        ? { safety: [{ coding: [coding(SYS.deviceSafety, 'C113844', 'Labeled as MR Unsafe')] }] }
        : {}),
      patient: subject,
    } satisfies Device)
  }
  if (p.implants?.mriFormPending) {
    out.push({
      resourceType: 'Observation',
      id: `obs-${key}-mri-form`,
      status: 'registered',
      category: survey,
      code: { coding: [coding(SYS.local, LOCAL.mriSafetyForm)], text: 'MRI safety form' },
      subject,
      encounter,
    } satisfies Observation)
  }
  if (p.lives) {
    out.push({
      resourceType: 'Observation',
      id: `obs-${key}-lives`,
      status: 'final',
      category: socialHistory,
      code: { coding: [coding(SYS.local, LOCAL.livingSituation)], text: 'Lives' },
      subject,
      valueString: p.lives,
    } satisfies Observation)
  }
  return out
}

/** Every resource of the simulated 4 West, times relative to `now`. */
export function seedResources(now = new Date()): Resource[] {
  const at = canvasClock(now)
  return [
    ...locationResources(),
    ...staffResources(),
    ...PATIENTS.flatMap((p, i) => patientResources(p, i, at, now)),
  ]
}

/** The seed as a FHIR collection Bundle. */
export function seedBundle(now = new Date()): Bundle {
  return {
    resourceType: 'Bundle',
    id: 'bell-4west-seed',
    type: 'collection',
    timestamp: now.toISOString(),
    entry: seedResources(now).map((resource) => ({
      fullUrl: `${resource.resourceType}/${resource.id}`,
      resource,
    })),
  }
}
