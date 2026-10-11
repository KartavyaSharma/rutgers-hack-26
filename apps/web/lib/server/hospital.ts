// The hospital layer (Epic) for apps/web. Today: the simulated Epic in @bell/epic.
// Bell reads clinical data only through this; it never writes clinical data back.

import type { HospitalRecord } from '@bell/core/hospital'
import { createSimulatedEpic, type FhirStore, type SimulatedEpic } from '@bell/epic'

// One instance per process so dev HMR, every route and /api/fhir share the same shift assignments.
const globalForHospital = globalThis as typeof globalThis & { __bellEpic?: SimulatedEpic }

const epic = (): SimulatedEpic => {
  globalForHospital.__bellEpic ??= createSimulatedEpic()
  return globalForHospital.__bellEpic
}

export const hospital = (): HospitalRecord => epic()

/** The FHIR R4 store behind hospital(), for the read-only /api/fhir endpoint. */
export const fhirStore = (): FhirStore => epic().store
