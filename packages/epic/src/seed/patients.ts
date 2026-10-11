// The demo patients on 4 West, as the design canvas shows them (PatientDialog / Patients).
// Times are canvas times around 15:15 (see ./time). build.ts turns these into FHIR resources.

import { LOINC, SNOMED } from '../codes'
import type { When } from './time'

/** flag-category codes used for watch items. */
type WatchCategory =
  | 'safety'
  | 'clinical'
  | 'drug'
  | 'diet'
  | 'contact'
  | 'advance-directive'
  | 'admin'
  | 'lab'

export interface MedSpec {
  name: string
  dose: string
  /** Last given. Missing: never given. "held": order on hold. */
  last?: When | 'held'
  /** Next dose time, or plain words ("After MRI"). Missing on an as-needed order: "As needed". */
  next?: When | string
  prn?: boolean
}

export interface LabSpec {
  code: string
  value: number
  low?: number
  high?: number
  at: When
}

export type TestSpec =
  | { name: string; result: string; at: When; service: 'RAD' | 'MB' | 'EC' }
  | { name: string; booked: When }

export interface NoteSpec {
  /** A roster practitioner id, or the name of someone outside the unit's roster. */
  by?: string
  name?: string
  /** Service line shown with the note: "Hospitalist", "Physical therapy". */
  setting?: string
  kind?: 'progress' | 'consult' | 'ed'
  title?: string
  at: When
  text: string
}

export interface PatientSpec {
  id: string
  given: string
  family: string
  age: number
  sex: 'male' | 'female'
  language: [code: string, display: string]
  room: string
  bed?: string
  nurse?: string
  doctor: string
  admitted: When
  reason: string
  /** Missing: not recorded yet. Empty: none known. */
  allergies?: { substance: string; reaction: string; category?: 'food' | 'medication' }[]
  dnr?: boolean
  /** Morse fall score and a short note. Missing: not scored yet. */
  fall?: { score: number; note?: string }
  diet?: {
    type: string
    texture?: string
    npo?: boolean
    instruction?: string
    fluidLimitMl?: number
    fluidTodayMl?: number
    /** Patient-facing reason, shown on the bedside tablet. */
    note?: string
  }
  /** Watch items in priority order: [text, flag category, optional SNOMED code]. */
  watch: [string, WatchCategory, string?][]
  vitals: { times: When[]; hr: number[]; sys: number[]; dia: number[]; o2: number[]; t: number[] }
  meds: MedSpec[]
  labs: LabSpec[]
  tests: TestSpec[]
  notes: NoteSpec[]
  conditions: string[]
  homeMeds?: string[]
  implants?: { device?: string; mrUnsafe?: boolean; mriFormPending?: boolean }
  lives?: string
}

export const PATIENTS: PatientSpec[] = [
  {
    // The bedside tablet demo patient (patient canvas, slides): "Hi, Maria · Room 412 · Bed 3".
    id: 'pt-maria',
    given: 'Maria',
    family: 'Santos',
    age: 46,
    sex: 'female',
    language: ['en', 'English'],
    room: '412',
    bed: '3',
    nurse: 'st-priya',
    doctor: 'pr-patel',
    admitted: 'yesterday 21:30',
    reason: 'Upper belly pain',
    allergies: [{ substance: 'Peanuts', reaction: 'Swelling', category: 'food' }],
    fall: { score: 50, note: 'call before getting up' },
    diet: {
      type: 'Nothing by mouth',
      npo: true,
      instruction: 'until after your ultrasound',
      note: 'Your belly ultrasound is scheduled for 2:00 PM since you last ate around 6:00 AM. Your stomach needs to be empty for clear pictures, so nothing to eat or drink for 8 hours. You can drink right after.',
    },
    watch: [
      ['Nothing by mouth', 'diet'],
      ['Fall risk: high', 'safety'],
      ['Peanut allergy', 'clinical'],
    ],
    vitals: {
      times: ['22:00', '02:00', '06:00', '10:00', '14:00'],
      hr: [92, 88, 86, 84, 86],
      sys: [138, 134, 132, 130, 132],
      dia: [86, 84, 82, 80, 82],
      o2: [98, 98, 99, 98, 98],
      t: [37.4, 37.2, 37.1, 37.0, 37.1],
    },
    meds: [
      { name: 'IV fluids', dose: 'Saline 100 mL an hour', last: '06:00', next: 'Running' },
      { name: 'Ondansetron', dose: '4 mg IV', last: '07:30', prn: true },
      { name: 'Acetaminophen', dose: '1 g IV', last: '10:00', next: '16:00' },
    ],
    labs: [
      { code: LOINC.wbc, value: 11.6, low: 4.0, high: 11.0, at: '06:00' },
      { code: LOINC.hemoglobin, value: 13.1, low: 12.0, high: 15.5, at: '06:00' },
      { code: LOINC.glucose, value: 104, low: 70, high: 140, at: '06:00' },
    ],
    tests: [{ name: 'Belly ultrasound', booked: '17:00' }],
    notes: [
      {
        by: 'pr-patel',
        setting: 'Hospitalist',
        at: '08:20',
        text: 'Upper right belly pain since last night, likely gallbladder. Ultrasound today, nothing by mouth until after. IV fluids running. Ice chips are fine.',
      },
    ],
    conditions: ['High blood pressure'],
    homeMeds: ['Lisinopril'],
    lives: 'With her husband and two kids',
  },
  {
    id: 'pt-jorge',
    given: 'Jorge',
    family: 'Reyes',
    age: 77,
    sex: 'male',
    language: ['es', 'Spanish'],
    room: '416',
    bed: 'A',
    nurse: 'st-priya',
    doctor: 'pr-patel',
    admitted: 'yesterday 10:20',
    reason: 'Pneumonia',
    allergies: [{ substance: 'Penicillin', reaction: 'Hives' }],
    fall: { score: 70, note: '2 people to stand' },
    diet: { type: 'Regular', texture: 'Soft' },
    watch: [
      ['Fall risk: high', 'safety'],
      ['Speaks Spanish', 'contact'],
      ['Penicillin allergy', 'drug'],
    ],
    vitals: {
      times: ['22:00', '02:00', '06:00', '10:00', '14:30'],
      hr: [96, 94, 90, 84, 88],
      sys: [136, 130, 128, 126, 132],
      dia: [80, 78, 76, 74, 78],
      o2: [91, 92, 93, 95, 94],
      t: [38.4, 38.1, 38.1, 37.6, 37.4],
    },
    meds: [
      { name: 'Azithromycin', dose: '500 mg IV', last: 'yesterday 16:00', next: '16:00' },
      { name: 'Ceftriaxone', dose: '1 g IV', last: '08:00', next: 'tomorrow 08:00' },
      { name: 'Acetaminophen', dose: '650 mg by mouth', last: '12:00', prn: true },
      { name: 'Enoxaparin', dose: '40 mg injection', last: '09:00', next: 'tomorrow 09:00' },
    ],
    labs: [
      { code: LOINC.wbc, value: 13.2, low: 4.0, high: 11.0, at: '06:00' },
      { code: LOINC.hemoglobin, value: 12.1, low: 13.5, high: 17.5, at: '06:00' },
      { code: LOINC.sodium, value: 134, low: 135, high: 145, at: '06:00' },
      { code: LOINC.creatinine, value: 1.1, low: 0.7, high: 1.3, at: '06:00' },
    ],
    tests: [
      {
        name: 'Chest X-ray',
        result: 'Right lower lobe pneumonia',
        at: 'yesterday 11:00',
        service: 'RAD',
      },
      { name: 'Sputum culture', result: 'Strep pneumoniae', at: '09:00', service: 'MB' },
    ],
    notes: [
      {
        by: 'pr-patel',
        setting: 'Hospitalist',
        at: '08:15',
        text: 'Fever down, white count improving. Keep IV antibiotics, switch to pills after 24 h with no fever. Metformin on hold, watch sugars.',
      },
      {
        name: 'Ana Silva',
        setting: 'Physical therapy',
        at: '11:00',
        text: 'Stands with 2 people and a gait belt. Walked 20 m with walker. Not safe to get up alone.',
      },
    ],
    conditions: ['COPD', 'Type 2 diabetes', 'High blood pressure'],
    homeMeds: ['Metformin', 'Lisinopril', 'Inhaler'],
    lives: 'With his daughter, uses a walker',
  },
  {
    id: 'pt-ruth',
    given: 'Ruth',
    family: 'Okafor',
    age: 68,
    sex: 'female',
    language: ['en', 'English'],
    room: '412',
    bed: 'A',
    nurse: 'st-priya',
    doctor: 'pr-shah',
    admitted: 'yesterday 07:00',
    reason: 'Left knee replacement',
    allergies: [{ substance: 'Codeine', reaction: 'Vomiting' }],
    fall: { score: 35 },
    diet: { type: 'Heart healthy' },
    watch: [
      ['Heart history', 'clinical'],
      ['On a blood thinner', 'drug'],
      ['Codeine allergy', 'drug'],
    ],
    vitals: {
      times: ['22:00', '02:00', '06:00', '10:00', '14:00'],
      hr: [76, 78, 80, 78, 84],
      sys: [124, 128, 130, 130, 138],
      dia: [74, 76, 78, 78, 82],
      o2: [98, 98, 97, 98, 97],
      t: [36.9, 36.8, 36.8, 36.9, 37.0],
    },
    meds: [
      { name: 'Apixaban', dose: '2.5 mg by mouth', last: '08:00', next: '20:00' },
      { name: 'Metoprolol', dose: '25 mg by mouth', last: '08:00', next: '20:00' },
      { name: 'Oxycodone', dose: '5 mg by mouth', last: '11:10', prn: true },
      { name: 'Nitroglycerin', dose: '0.4 mg under the tongue', prn: true },
    ],
    labs: [
      { code: LOINC.hemoglobin, value: 10.9, low: 12.0, high: 15.5, at: '06:00' },
      { code: LOINC.potassium, value: 3.4, low: 3.5, high: 5.0, at: '06:00' },
      { code: LOINC.inr, value: 1.1, low: 0.9, high: 1.2, at: '06:00' },
    ],
    tests: [
      {
        name: 'Knee X-ray',
        result: 'Implant in good position',
        at: 'yesterday 13:00',
        service: 'RAD',
      },
      {
        name: 'ECG',
        result: 'Normal rhythm, old changes from 2019',
        at: 'yesterday 06:30',
        service: 'EC',
      },
    ],
    notes: [
      {
        by: 'pr-shah',
        setting: 'Orthopedics',
        at: '07:30',
        text: 'Wound dry. Restart apixaban tonight. Avoid codeine. PT twice a day.',
      },
      {
        by: 'pr-patel',
        setting: 'Medicine consult',
        kind: 'consult',
        at: '10:15',
        text: 'Heart attack 2019 with stent. Any chest pain needs an ECG and troponin right away.',
      },
    ],
    conditions: ['Heart attack 2019 with stent', 'High cholesterol'],
    homeMeds: ['Apixaban', 'Atorvastatin', 'Metoprolol'],
    lives: 'With her husband',
  },
  {
    id: 'pt-erik',
    given: 'Erik',
    family: 'Lindqvist',
    age: 71,
    sex: 'male',
    language: ['en', 'English'],
    room: '414',
    nurse: 'st-priya',
    doctor: 'pr-shah',
    admitted: 'yesterday 07:30',
    reason: 'Right hip replacement',
    allergies: [],
    fall: { score: 55, note: 'walker and 1 person' },
    diet: { type: 'Regular' },
    watch: [
      ['Fall risk: high', 'safety'],
      ['Hip precautions', 'safety'],
    ],
    vitals: {
      times: ['22:00', '02:00', '06:00', '10:00', '15:06'],
      hr: [78, 80, 82, 84, 96],
      sys: [128, 130, 134, 134, 148],
      dia: [76, 78, 80, 80, 88],
      o2: [97, 97, 97, 96, 96],
      t: [37.0, 37.0, 36.9, 37.2, 37.2],
    },
    meds: [
      { name: 'Oxycodone', dose: '5 mg by mouth', last: '10:30', next: '14:30', prn: true },
      { name: 'Acetaminophen', dose: '1 g by mouth', last: '12:00', next: '20:00' },
      { name: 'Enoxaparin', dose: '40 mg injection', last: '09:00', next: 'tomorrow 09:00' },
    ],
    labs: [
      { code: LOINC.hemoglobin, value: 11.4, low: 13.5, high: 17.5, at: '06:00' },
      { code: LOINC.creatinine, value: 1.0, low: 0.7, high: 1.3, at: '06:00' },
    ],
    tests: [
      {
        name: 'Hip X-ray',
        result: 'Implant in good position',
        at: 'yesterday 13:30',
        service: 'RAD',
      },
    ],
    notes: [
      {
        by: 'pr-shah',
        setting: 'Orthopedics',
        at: '07:45',
        text: 'No bending past 90, no crossing legs. Avoid ibuprofen, mild kidney disease.',
      },
      {
        name: 'Ana Silva',
        setting: 'Physical therapy',
        at: '10:30',
        text: 'Walked 15 m with walker and 1 person. Next session 16:30.',
      },
    ],
    conditions: ['Arthritis', 'Mild kidney disease'],
    homeMeds: ['Amlodipine', 'Vitamin D'],
    lives: 'Alone, son nearby',
  },
  {
    id: 'pt-ade',
    given: 'Ade',
    family: 'Abara',
    age: 54,
    sex: 'male',
    language: ['en', 'English'],
    room: '420',
    nurse: 'st-priya',
    doctor: 'pr-patel',
    admitted: 'yesterday 18:40',
    reason: 'Headaches and dizziness',
    allergies: [],
    fall: { score: 30 },
    diet: { type: 'Nothing by mouth', npo: true, instruction: 'until after MRI' },
    watch: [
      ['Nothing by mouth', 'diet'],
      ['MRI form not done', 'admin'],
    ],
    vitals: {
      times: ['22:00', '02:00', '06:00', '10:00', '14:00'],
      hr: [70, 68, 72, 70, 72],
      sys: [160, 158, 160, 156, 152],
      dia: [96, 94, 96, 94, 94],
      o2: [98, 98, 98, 98, 98],
      t: [36.6, 36.6, 36.6, 36.7, 36.7],
    },
    meds: [
      { name: 'Amlodipine', dose: '5 mg by mouth', last: 'held', next: 'After MRI' },
      { name: 'Acetaminophen', dose: '650 mg by mouth', last: '08:00', next: 'After MRI' },
    ],
    labs: [
      { code: LOINC.sodium, value: 139, low: 135, high: 145, at: '06:00' },
      { code: LOINC.hemoglobin, value: 14.6, low: 13.5, high: 17.5, at: '06:00' },
    ],
    tests: [
      { name: 'Head CT', result: 'Normal', at: 'yesterday 19:10', service: 'RAD' },
      { name: 'Brain MRI', booked: '15:45' },
    ],
    notes: [
      {
        by: 'pr-patel',
        setting: 'Hospitalist',
        at: '09:00',
        text: 'Brain MRI at 15:45 to rule out stroke. Nothing by mouth until after the MRI.',
      },
      {
        name: 'Dr. Reyes',
        setting: 'Neurology',
        kind: 'consult',
        at: '12:10',
        text: 'Normal exam. Likely migraine, but MRI first.',
      },
    ],
    conditions: ['Migraines', 'Sleep apnea'],
    implants: { mriFormPending: true },
  },
  {
    id: 'pt-may',
    given: 'May',
    family: 'Chen',
    age: 81,
    sex: 'female',
    language: ['en', 'English'],
    room: '412',
    bed: 'B',
    nurse: 'st-priya',
    doctor: 'pr-patel',
    admitted: '-2d 21:00',
    reason: 'Heart failure',
    allergies: [{ substance: 'Sulfa', reaction: 'Rash' }],
    dnr: true,
    fall: { score: 40 },
    diet: { type: 'Low salt', fluidLimitMl: 1500, fluidTodayMl: 1100 },
    watch: [
      ['Fluid limit', 'diet'],
      ['DNR', 'advance-directive'],
      ['Hard of hearing', 'contact', SNOMED.hearingLoss],
      ['Sulfa allergy', 'drug'],
    ],
    vitals: {
      times: ['22:00', '02:00', '06:00', '10:00', '14:00'],
      hr: [82, 80, 80, 78, 78],
      sys: [126, 124, 122, 120, 118],
      dia: [76, 74, 72, 72, 70],
      o2: [93, 94, 94, 95, 95],
      t: [36.6, 36.5, 36.6, 36.6, 36.5],
    },
    meds: [
      { name: 'Furosemide', dose: '40 mg IV', last: '08:00', next: '16:00' },
      { name: 'Insulin lispro', dose: 'Sliding scale', last: '11:45', next: 'With dinner' },
      { name: 'Metoprolol', dose: '25 mg by mouth', last: '08:00', next: '20:00' },
    ],
    labs: [
      { code: LOINC.bnp, value: 820, high: 100, at: '06:00' },
      { code: LOINC.sodium, value: 133, low: 135, high: 145, at: '06:00' },
      { code: LOINC.creatinine, value: 1.4, low: 0.6, high: 1.1, at: '06:00' },
    ],
    tests: [
      { name: 'Chest X-ray', result: 'Less fluid than on admission', at: '07:00', service: 'RAD' },
    ],
    notes: [
      {
        by: 'pr-patel',
        setting: 'Hospitalist',
        at: '08:30',
        text: 'Weight down 0.8 kg, legs less swollen. Fluid limit 1.5 L a day. Keep IV furosemide.',
      },
      {
        name: 'Dr. Kim',
        setting: 'Cardiology',
        kind: 'consult',
        at: '13:00',
        text: 'Pacemaker working. Plan home in 1 to 2 days if weight keeps dropping.',
      },
    ],
    conditions: ['Heart failure', 'Atrial fibrillation', 'Kidney disease'],
    implants: { device: 'Pacemaker', mrUnsafe: true },
    lives: 'Assisted living',
  },
  {
    id: 'pt-sami',
    given: 'Sami',
    family: 'Haddad',
    age: 45,
    sex: 'male',
    language: ['en', 'English'],
    room: '410',
    nurse: 'st-priya',
    doctor: 'pr-patel',
    admitted: '-3d 14:00',
    reason: 'Kidney infection',
    allergies: [],
    fall: { score: 15 },
    diet: { type: 'Regular' },
    watch: [],
    vitals: {
      times: ['22:00', '02:00', '06:00', '10:00', '14:00'],
      hr: [84, 82, 80, 78, 72],
      sys: [128, 126, 126, 124, 122],
      dia: [80, 80, 80, 78, 78],
      o2: [98, 98, 98, 99, 99],
      t: [37.3, 37.1, 37.0, 36.9, 36.8],
    },
    meds: [
      { name: 'Ciprofloxacin', dose: '500 mg by mouth', last: '08:00', next: '20:00' },
      { name: 'Acetaminophen', dose: '650 mg by mouth', last: '-2d 22:00', prn: true },
    ],
    labs: [
      { code: LOINC.wbc, value: 9.8, low: 4.0, high: 11.0, at: '06:00' },
      { code: LOINC.creatinine, value: 1.0, low: 0.7, high: 1.3, at: '06:00' },
    ],
    tests: [
      {
        name: 'Urine culture',
        result: 'E. coli, treated by current antibiotic',
        at: '-2d 10:00',
        service: 'MB',
      },
    ],
    notes: [
      {
        by: 'pr-patel',
        setting: 'Hospitalist',
        at: '08:45',
        text: 'No fever for 36 h. Switch to pills today. Likely home tomorrow.',
      },
    ],
    conditions: ['Kidney stones'],
    lives: 'With his partner',
  },
  {
    id: 'pt-leo',
    given: 'Leo',
    family: 'Brandt',
    age: 39,
    sex: 'male',
    language: ['en', 'English'],
    room: '418',
    nurse: 'st-ana',
    doctor: 'pr-shah',
    admitted: 'yesterday 06:50',
    reason: 'Appendicitis',
    allergies: [],
    fall: { score: 10 },
    diet: { type: 'Clear liquids' },
    watch: [],
    vitals: {
      times: ['22:00', '02:00', '06:00', '10:00', '14:00'],
      hr: [86, 84, 82, 80, 80],
      sys: [128, 126, 124, 124, 124],
      dia: [82, 80, 80, 80, 80],
      o2: [97, 98, 98, 98, 98],
      t: [37.2, 37.0, 36.9, 36.9, 36.8],
    },
    meds: [
      { name: 'Cefazolin', dose: '1 g IV', last: '08:00', next: '16:00' },
      { name: 'Acetaminophen', dose: '650 mg by mouth', last: '11:00', prn: true },
    ],
    labs: [{ code: LOINC.wbc, value: 10.2, low: 4.0, high: 11.0, at: '06:00' }],
    tests: [
      {
        name: 'CT abdomen',
        result: 'Appendicitis, no abscess',
        at: 'yesterday 07:40',
        service: 'RAD',
      },
    ],
    notes: [
      {
        by: 'pr-shah',
        setting: 'Surgery',
        at: '08:00',
        text: 'Clear liquids. Walk the hall twice today.',
      },
    ],
    conditions: ['None'],
  },
  {
    id: 'pt-grace',
    given: 'Grace',
    family: 'Liu',
    age: 63,
    sex: 'female',
    language: ['en', 'English'],
    room: '422',
    nurse: 'st-ana',
    doctor: 'pr-patel',
    admitted: '-2d 16:00',
    reason: 'Diabetic foot wound',
    allergies: [],
    fall: { score: 35 },
    diet: { type: 'Diabetic' },
    watch: [
      ['Diabetic diet', 'diet'],
      ['High blood sugar', 'lab'],
    ],
    vitals: {
      times: ['22:00', '02:00', '06:00', '10:00', '14:30'],
      hr: [80, 82, 84, 80, 82],
      sys: [132, 130, 134, 136, 134],
      dia: [80, 78, 80, 82, 80],
      o2: [97, 97, 97, 97, 97],
      t: [36.8, 36.9, 36.8, 36.9, 36.9],
    },
    meds: [
      { name: 'Insulin glargine', dose: '20 units', last: 'yesterday 21:00', next: '21:00' },
      { name: 'Cefazolin', dose: '1 g IV', last: '08:00', next: '16:00' },
    ],
    labs: [
      { code: LOINC.glucose, value: 212, low: 70, high: 140, at: '14:30' },
      { code: LOINC.a1c, value: 9.1, high: 5.7, at: '-2d 18:00' },
    ],
    tests: [{ name: 'Foot X-ray', result: 'No bone infection', at: '-2d 18:00', service: 'RAD' }],
    notes: [
      {
        by: 'pr-patel',
        setting: 'Hospitalist',
        at: '09:30',
        text: 'Day 2 of IV antibiotics. Sugars high, insulin adjusted. Wound care today.',
      },
    ],
    conditions: ['Type 2 diabetes', 'Nerve damage in feet'],
  },
  {
    id: 'pt-tom',
    given: 'Tom',
    family: 'Price',
    age: 58,
    sex: 'male',
    language: ['en', 'English'],
    room: '424',
    doctor: 'pr-shah',
    admitted: '14:50',
    reason: 'Chest infection',
    watch: [],
    vitals: {
      times: ['14:50', '14:55'],
      hr: [90, 88],
      sys: [144, 140],
      dia: [88, 86],
      o2: [96, 96],
      t: [37.0, 37.0],
    },
    meds: [],
    labs: [],
    tests: [],
    notes: [
      {
        kind: 'ed',
        title: 'ER handoff',
        at: '14:50',
        text: 'Cough and fever for 2 days. Small chest infection on X-ray. Waiting for a nurse and admission orders.',
      },
    ],
    conditions: [],
  },
  {
    id: 'pt-arjun',
    given: 'Arjun',
    family: 'Mehta',
    age: 68,
    sex: 'male',
    language: ['hi', 'Hindi'],
    room: '426',
    nurse: 'st-priya',
    doctor: 'pr-shah',
    admitted: 'yesterday 18:40',
    reason: 'Heart failure flare-up',
    allergies: [{ substance: 'Shellfish', reaction: 'Rash', category: 'food' }],
    fall: { score: 45, note: 'call before getting up' },
    diet: { type: 'Low salt', fluidLimitMl: 1500, fluidTodayMl: 900 },
    watch: [
      ['Fluid limit', 'diet'],
      ['Speaks Hindi', 'contact'],
      ['Shellfish allergy', 'clinical'],
    ],
    vitals: {
      times: ['22:00', '02:00', '06:00', '10:00', '14:00'],
      hr: [104, 98, 94, 90, 88],
      sys: [158, 150, 146, 140, 138],
      dia: [94, 90, 88, 86, 84],
      o2: [91, 92, 94, 95, 95],
      t: [36.8, 36.9, 36.8, 36.9, 36.8],
    },
    meds: [
      { name: 'Furosemide', dose: '40 mg IV', last: '08:00', next: '16:00' },
      { name: 'Metoprolol', dose: '25 mg by mouth', last: '08:00', next: '20:00' },
      { name: 'Enoxaparin', dose: '40 mg injection', last: '09:00', next: 'tomorrow 09:00' },
    ],
    labs: [
      { code: LOINC.bnp, value: 1240, high: 100, at: '06:00' },
      { code: LOINC.sodium, value: 133, low: 135, high: 145, at: '06:00' },
      { code: LOINC.potassium, value: 3.6, low: 3.5, high: 5.1, at: '06:00' },
      { code: LOINC.creatinine, value: 1.4, low: 0.7, high: 1.3, at: '06:00' },
    ],
    tests: [
      { name: 'Chest X-ray', result: 'Fluid in both lungs', at: 'yesterday 19:30', service: 'RAD' },
      { name: 'Heart ultrasound', booked: 'tomorrow 10:00' },
    ],
    notes: [
      {
        by: 'pr-shah',
        setting: 'Hospitalist',
        at: '09:00',
        text: 'Breathing easier after IV diuretic, down 1.2 kg. Keep fluid limit and low salt. Echo tomorrow.',
      },
    ],
    conditions: ['Heart failure', 'High blood pressure'],
    homeMeds: ['Furosemide', 'Metoprolol', 'Lisinopril'],
    lives: 'With his wife and son',
  },
]
