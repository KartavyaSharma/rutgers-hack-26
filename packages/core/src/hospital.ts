// The hospital layer (Epic) as Bell sees it. Bell only reads clinical data through this
// interface and never writes it back. Today it is backed by the simulated Epic in
// packages/epic (FHIR R4 shaped resources); later the same interface wraps Epic's FHIR APIs.
//
// Ids are stable strings so demo data lines up across layers:
// patients `pt-<first name>` (pt-jorge), staff `st-<first name>` (st-priya), doctors `pr-<last name>` (pr-patel),
// rooms like `416` with beds `A` / `B` (a room without beds uses bed `''`).

export type StaffRole =
  | 'nurse'
  | 'charge_nurse'
  | 'aide'
  | 'pct'
  | 'transport'
  | 'case_manager'
  | 'doctor'

export interface StaffMember {
  id: string
  name: string
  role: StaffRole
  /** Short label for chips and owner lines, e.g. "RN", "Aide", "PCT". */
  roleLabel: string
  /** Doctors only, e.g. "Hospitalist". */
  specialty?: string
  unit: string
  /** Served by apps/staff from /public, e.g. "/staff/priya.png". */
  photoUrl?: string
  contact?: string
  email?: string
}

export interface Bed {
  room: string
  bed: string
  /** "416A", or "414" when the room has no beds. */
  label: string
}

export interface PatientSummary {
  id: string
  name: string
  age: number
  sex: 'M' | 'F'
  location: Bed
  unit: string
  /** The nurse assigned this shift, if any. */
  nurseId?: string
  doctorId?: string
}

export interface Fact {
  label: 'Allergy' | 'Code' | 'Fall risk' | 'Diet' | 'Language' | 'Isolation'
  value: string
  /** Shown in red: a real allergy, DNR. */
  alert?: boolean
}

/** One vital sign series for today, oldest first. Blood pressure uses value (systolic) and value2 (diastolic). */
export interface VitalSeries {
  kind: 'heart_rate' | 'blood_pressure' | 'oxygen' | 'temperature'
  label: string
  unit: string
  normal: { low: number; high: number; text: string }
  points: { time: string; value: number; value2?: number }[]
}

export interface Medication {
  name: string
  dose: string
  lastGiven: string
  next: string
  due: boolean
}

export interface LabResult {
  name: string
  value: string
  flag?: 'high' | 'low'
  normal?: string
  time: string
}

export interface ClinicalNote {
  author: string
  when: string
  text: string
}

export interface PatientChart {
  patient: PatientSummary
  facts: Fact[]
  /** Only the people assigned to this patient: the doctor and the assigned nurse. */
  careTeam: StaffMember[]
  vitals: VitalSeries[]
  medications: Medication[]
  labs: LabResult[]
  tests: { name: string; result: string; when: string }[]
  notes: ClinicalNote[]
  history: { label: string; value: string }[]
  /** Short, plain watch-for items in priority order, e.g. "Fall risk: high". The table shows only the first. */
  watch: string[]
}

export interface HospitalRecord {
  /** Everyone on the unit's roster this shift. */
  staff(unit?: string): Promise<StaffMember[]>
  staffById(id: string): Promise<StaffMember | null>
  staffByEmail(email: string): Promise<StaffMember | null>
  patients(unit?: string): Promise<PatientSummary[]>
  patientInRoom(room: string, bed?: string): Promise<PatientSummary | null>
  chart(patientId: string): Promise<PatientChart | null>
  /** Simulated Epic only: the shift's nurse assignment (charge nurse assigns, nurse can take an unassigned patient). */
  assignNurse(patientId: string, nurseId: string | null): Promise<void>
}
