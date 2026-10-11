// The 4 West roster this shift: Practitioner + PractitionerRole per person.

import type { StaffRole } from '@bell/core/hospital'
import { coding, ROLE_LABEL, SNOMED, SYS } from '../codes'
import type { ContactPoint, Practitioner, PractitionerRole } from '../fhir'

export const UNIT_LOCATION = 'Location/loc-4west'

interface StaffSpec {
  id: string
  given: string
  family: string
  role: StaffRole
  prefix?: string
  specialty?: string
  ext?: string
  pager?: string
  photo?: boolean
}

const ROSTER: StaffSpec[] = [
  { id: 'st-priya', given: 'Priya', family: 'Raman', role: 'nurse', ext: '4410', photo: true },
  { id: 'st-ana', given: 'Ana', family: 'Ruiz', role: 'nurse', ext: '4405' },
  { id: 'st-dana', given: 'Dana', family: 'Kerr', role: 'charge_nurse' },
  { id: 'st-sam', given: 'Sam', family: 'Kim', role: 'pct', photo: true },
  { id: 'st-lee', given: 'Lee', family: 'Martin', role: 'aide', photo: true },
  { id: 'st-jo', given: 'Jo', family: 'Turner', role: 'aide', photo: true },
  { id: 'st-kai', given: 'Kai', family: 'Foster', role: 'transport', photo: true },
  { id: 'st-ray', given: 'Ray', family: 'Cole', role: 'case_manager' },
  {
    id: 'pr-patel',
    given: 'Nina',
    family: 'Patel',
    prefix: 'Dr.',
    role: 'doctor',
    specialty: 'Hospitalist',
    pager: '2140',
  },
  {
    id: 'pr-shah',
    given: 'Omar',
    family: 'Shah',
    prefix: 'Dr.',
    role: 'doctor',
    specialty: 'Orthopedics',
    pager: '2231',
  },
]

const SNOMED_ROLE: Partial<Record<StaffRole, [string, string]>> = {
  nurse: [SNOMED.registeredNurse, 'Registered nurse'],
  charge_nurse: [SNOMED.registeredNurse, 'Registered nurse'],
  doctor: [SNOMED.physician, 'Physician'],
}

export function staffResources(): (Practitioner | PractitionerRole)[] {
  return ROSTER.flatMap((s) => {
    const first = s.given.toLowerCase()
    const text = [s.prefix, s.given, s.family].filter(Boolean).join(' ')
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      id: s.id,
      active: true,
      name: [
        { text, family: s.family, given: [s.given], ...(s.prefix ? { prefix: [s.prefix] } : {}) },
      ],
      telecom: [{ system: 'email', value: `${first}@bell.demo`, use: 'work' }],
      ...(s.photo ? { photo: [{ contentType: 'image/png', url: `/staff/${first}.png` }] } : {}),
    }
    const telecom: ContactPoint[] = []
    if (s.ext) telecom.push({ system: 'phone', value: s.ext, use: 'work' })
    if (s.pager) telecom.push({ system: 'pager', value: s.pager, use: 'work' })
    const snomed = SNOMED_ROLE[s.role]
    const role: PractitionerRole = {
      resourceType: 'PractitionerRole',
      id: `role-${s.id}`,
      active: true,
      practitioner: { reference: `Practitioner/${s.id}`, display: text },
      code: [
        {
          coding: [
            coding(SYS.staffRole, s.role, ROLE_LABEL[s.role]),
            ...(snomed ? [coding(SYS.snomed, snomed[0], snomed[1])] : []),
          ],
          text: ROLE_LABEL[s.role],
        },
      ],
      ...(s.specialty ? { specialty: [{ text: s.specialty }] } : {}),
      location: [{ reference: UNIT_LOCATION, display: '4 West' }],
      ...(telecom.length ? { telecom } : {}),
    }
    return [practitioner, role]
  })
}
