// What the staff service reads from the hospital layer for one call: the roster and the patients.
// Bell only reads here; the one write is the shift assignment (assignNurse) in patients.ts.

import type { PatientSummary, StaffMember } from '@bell/core/hospital'
import { hospital } from '../hospital'

export const UNIT = '4 West'

export interface Shift {
  staff: StaffMember[]
  patients: PatientSummary[]
  staffById: Map<string, StaffMember>
  patientById: Map<string, PatientSummary>
}

export const loadShift = async (): Promise<Shift> => {
  const [staff, patients] = await Promise.all([hospital().staff(UNIT), hospital().patients(UNIT)])
  return {
    staff,
    patients,
    staffById: new Map(staff.map((s) => [s.id, s])),
    patientById: new Map(patients.map((p) => [p.id, p])),
  }
}

/** The patient's nurse right now, falling back to who it was when the ticket came in. */
export const nurseOf = (
  shift: Shift,
  patientId: string,
  fallback: string | null,
): string | null => {
  const patient = shift.patientById.get(patientId)
  return patient ? (patient.nurseId ?? null) : fallback
}

/** True when this staff member reviews (and sees in Incoming) requests from this patient. */
export const reviewsFor = (
  viewer: StaffMember,
  shift: Shift,
  patientId: string,
  nurseAtTheTime: string | null,
): boolean => {
  if (viewer.role === 'charge_nurse') return true
  if (viewer.role !== 'nurse') return false
  return nurseOf(shift, patientId, nurseAtTheTime) === viewer.id
}
