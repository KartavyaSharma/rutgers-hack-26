// Finds people, teams and patients named in a nurse's free text (Ask Bell, rejection reasons).

import type { PatientSummary, StaffMember } from '@bell/core/hospital'
import type { Person } from '@bell/core/staff-api'
import { personOf, TEAM_WORDS, TEAMS } from './people'

// First names that are also everyday words only count when capitalized.
const COMMON_WORDS = new Set(['may', 'grace', 'will', 'jo'])

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const nameRegex = (name: string): RegExp =>
  new RegExp(`\\b${escapeRegex(name)}\\b`, COMMON_WORDS.has(name.toLowerCase()) ? '' : 'i')

const indexOfName = (text: string, name: string): number => text.search(nameRegex(name))

export const SELF_WORDS = /\b(me|myself|i'll|i will|i can|i'?ll do it|i do it)\b/i

export interface Mention {
  person: Person
  staff?: StaffMember
  at: number
}

/** People and teams named in the text, in the order they appear. */
export const mentionedPeople = (
  text: string,
  roster: StaffMember[],
  patientDoctorId?: string,
): Mention[] => {
  const found: Mention[] = []
  for (const staff of roster) {
    const parts = staff.name.replace(/^Dr\.\s+/, '').split(' ')
    const first = parts[0] ?? ''
    const last = parts[parts.length - 1] ?? ''
    const at = staff.role === 'doctor' ? indexOfName(text, last) : indexOfName(text, first)
    if (at >= 0) found.push({ person: personOf(staff), staff, at })
  }
  if (patientDoctorId && !found.some((m) => m.staff?.role === 'doctor')) {
    const at = text.search(/\b(doctor|dr)\b/i)
    const doctor = roster.find((s) => s.id === patientDoctorId)
    if (at >= 0 && doctor) found.push({ person: personOf(doctor), staff: doctor, at })
  }
  if (!found.some((m) => m.staff?.role === 'transport')) {
    const at = text.search(/\btransport\b/i)
    const transport = roster.find((s) => s.role === 'transport')
    if (at >= 0 && transport) found.push({ person: personOf(transport), staff: transport, at })
  }
  for (const [regex, key] of TEAM_WORDS) {
    const at = text.search(regex)
    if (at >= 0) found.push({ person: TEAMS[key], at })
  }
  return found.sort((a, b) => a.at - b.at)
}

/** The patient named in the text, by first name, full name or room ("412B", "room 416"). */
export const mentionedPatient = (
  text: string,
  patients: PatientSummary[],
): { patient: PatientSummary; match: string } | null => {
  let best: { patient: PatientSummary; match: string; at: number } | null = null
  for (const patient of patients) {
    const first = patient.name.split(' ')[0] ?? patient.name
    for (const candidate of [patient.name, first]) {
      const regex = nameRegex(candidate)
      const m = regex.exec(text)
      if (m && (!best || m.index < best.at)) best = { patient, match: m[0], at: m.index }
      if (m) break
    }
  }
  if (best) return { patient: best.patient, match: best.match }
  for (const patient of patients) {
    const label = patient.location.label
    const m = new RegExp(`\\b(room\\s+)?${escapeRegex(label)}\\b`, 'i').exec(text)
    if (m) return { patient, match: m[0] }
  }
  return null
}
