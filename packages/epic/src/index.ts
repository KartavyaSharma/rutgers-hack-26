// Simulated Epic: an in-memory FHIR R4 store seeded with the demo unit (4 West).
// Implements @bell/core/hospital's HospitalRecord so real Epic can replace it later.
// Bell only reads through it; the one write is the simulated shift nurse assignment.

import type { HospitalRecord } from '@bell/core/hospital'
import { SYS } from './codes'
import { labels } from './format'
import { careTeamIds, roleFor, roleOf, toChart, toStaffMember, toSummary } from './map'
import { seedResources } from './seed'
import { createFhirStore, type FhirStore } from './store'

export type * from './fhir'
export { seedBundle, seedResources } from './seed'
export { createFhirStore, type FhirStore, SEARCH_PARAMS, type SearchParams } from './store'

export interface SimulatedEpic extends HospitalRecord {
  /** The FHIR store behind it, for the read-only /api/fhir endpoint. */
  store: FhirStore
}

export interface SimulatedEpicOptions {
  /** Pin the seed "now" (tests). By default the seed follows the clock, see below. */
  now?: Date
  /** IANA zone for chart time labels. Defaults to BELL_TIME_ZONE, then the server's zone. */
  timeZone?: string
}

/** The seed re-anchors to the clock every 15 minutes so the unit always looks live. */
const ANCHOR_MS = 15 * 60_000

const nurseCode = (concepts?: { coding?: { system?: string; code?: string }[] }[]) =>
  concepts?.[0]?.coding?.some((c) => c.system === SYS.staffRole && c.code === 'nurse')
const isPart = (p: { type?: { coding?: { code?: string }[] }[] }) =>
  p.type?.[0]?.coding?.some((c) => c.code === 'PART')

/** Points the patient's CareTeam and Encounter at the new nurse (or none). */
function writeAssignment(store: FhirStore, patientId: string, nurseId: string | null, at: string) {
  const { team } = careTeamIds(store, patientId)
  const enc = store.search('Encounter', { patient: patientId, status: 'in-progress' })[0]
  if (!team || !enc) throw new Error(`No current admission for ${patientId}`)
  const member = nurseId ? { reference: `Practitioner/${nurseId}` } : null
  const role = team.participant.find((p) => nurseCode(p.role))?.role ?? [
    { coding: [{ system: SYS.staffRole, code: 'nurse', display: 'RN' }], text: 'Nurse' },
  ]
  const others = team.participant.filter((p) => !nurseCode(p.role))
  store.update({
    ...team,
    participant: member ? [...others, { role, member, period: { start: at } }] : others,
  })
  const kept = (enc.participant ?? []).filter((p) => !isPart(p))
  const type = [
    { coding: [{ system: SYS.participationType, code: 'PART', display: 'Participation' }] },
  ]
  store.update({
    ...enc,
    participant: member ? [...kept, { type, individual: member, period: { start: at } }] : kept,
  })
}

export function createSimulatedEpic(options: SimulatedEpicOptions = {}): SimulatedEpic {
  const timeZone = options.timeZone ?? process.env.BELL_TIME_ZONE
  const now = () => new Date()
  // Shift assignments made through assignNurse, replayed whenever the seed re-anchors.
  const assignments = new Map<string, { nurseId: string | null; at: string }>()
  let anchor = Number.NaN
  let inner: FhirStore | undefined
  const current = (): FhirStore => {
    const next = options.now
      ? options.now.getTime()
      : Math.floor(now().getTime() / ANCHOR_MS) * ANCHOR_MS
    if (!inner || next !== anchor) {
      anchor = next
      const fresh = createFhirStore(seedResources(new Date(next)))
      for (const [patientId, a] of assignments) writeAssignment(fresh, patientId, a.nurseId, a.at)
      inner = fresh
    }
    return inner
  }
  const store: FhirStore = {
    types: () => current().types(),
    read: (type, id) => current().read(type, id),
    search: (type, params) => current().search(type, params),
    update: (resource) => current().update(resource),
  }

  const allStaff = () =>
    store
      .search('PractitionerRole')
      .filter((r) => r.active !== false)
      .map((r) => toStaffMember(store, r))
      .filter((s) => s !== null)

  const allPatients = () =>
    store
      .search('Patient')
      .filter((p) => p.active !== false)
      .map((p) => toSummary(store, p, now()))
      .filter((p) => p !== null)

  return {
    store,
    staff: async (unit) => allStaff().filter((s) => !unit || s.unit === unit),
    staffById: async (id) => {
      const role = roleFor(store, id)
      return role ? toStaffMember(store, role) : null
    },
    staffByEmail: async (email) => {
      const wanted = email.trim().toLowerCase()
      const person = store
        .search('Practitioner')
        .find((p) =>
          p.telecom?.some((t) => t.system === 'email' && t.value?.toLowerCase() === wanted),
        )
      const role = person ? roleFor(store, person.id) : null
      return role ? toStaffMember(store, role) : null
    },
    patients: async (unit) => allPatients().filter((p) => !unit || p.unit === unit),
    patientInRoom: async (room, bed) =>
      allPatients().find(
        (p) => p.location.room === room && (bed === undefined || p.location.bed === bed),
      ) ?? null,
    chart: async (patientId) => toChart(store, patientId, labels(timeZone, now())),
    assignNurse: async (patientId, nurseId) => {
      const role = nurseId ? roleFor(store, nurseId) : null
      const kind = role ? roleOf(role) : undefined
      if (nurseId && kind !== 'nurse' && kind !== 'charge_nurse') {
        throw new Error(`${nurseId} is not a nurse on the roster`)
      }
      const at = now().toISOString()
      writeAssignment(current(), patientId, nurseId, at)
      assignments.set(patientId, { nurseId, at })
    },
  }
}
