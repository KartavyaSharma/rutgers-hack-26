// The chart facts the patient tablet reads: one small read interface over the hospital layer
// (the simulated Epic in @bell/epic: FHIR NutritionOrder, AllergyIntolerance, Flag). Read only.
// Falls back to the demo below when Epic has no patient in the tablet's bed.

import { fhirStore, hospital } from '@/lib/server/hospital'

/** NutritionOrder: nothing by mouth, with the reason in plain words. */
export interface NothingByMouth {
  /** Patient-facing title, e.g. "Nothing to eat or drink until after your ultrasound". */
  title: string
  /** Patient-facing reason. */
  reason: string
}

export interface Chart {
  npo?: NothingByMouth
  /** NutritionOrder fluid restriction, in ml per day. */
  fluidLimitMl?: number
  /** NutritionOrder oral diet, patient words, e.g. "Low sugar diet". */
  diet?: string
  /** AllergyIntolerance (food only), patient words, e.g. "peanuts". */
  foodAllergies: readonly string[]
  /** Flag: fall risk. */
  fallRisk: boolean
  /** Flag: isolation (e.g. C. diff). Routing only; the tablet shows nothing. */
  isolation?: string
}

export interface PatientInRoom {
  /** First name for the greeting, null when no one is admitted to the room. */
  firstName: string | null
  roomId: string
  bed: string | null
  chart: Chart
}

const NO_LIMITS: Chart = { foodAllergies: [], fallRisk: false }

const DEMO: Readonly<Record<string, Omit<PatientInRoom, 'roomId'>>> = {
  '412': {
    firstName: 'Maria',
    bed: '3',
    chart: {
      npo: {
        title: 'Nothing to eat or drink until after your ultrasound',
        reason:
          'Your belly ultrasound is scheduled for 2:00 PM since you last ate around 6:00 AM. Your stomach needs to be empty for clear pictures, so nothing to eat or drink for 8 hours. You can drink right after.',
      },
      diet: 'Low sugar diet',
      foodAllergies: ['peanuts'],
      fallRisk: true,
    },
  },
}

/** The bed each room's tablet serves (a room can hold two patients). */
const TABLET_BED: Readonly<Record<string, string>> = { '412': '3' }

const NPO_CODE = 'npo'
const FLUID_LIMIT_EXT = '/fluid-limit'
const DEFAULT_NPO_REASON = 'Your care team needs your stomach empty for this. You can eat and drink right after.'

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

const fromEpic = async (roomId: string): Promise<PatientInRoom | null> => {
  const summary = await hospital().patientInRoom(roomId, TABLET_BED[roomId])
  if (!summary) return null
  const store = fhirStore()
  const pid = summary.id
  const chart = await hospital().chart(pid)
  const fact = (label: string) => chart?.facts.find((f) => f.label === label)?.value ?? ''

  const order = store.search('NutritionOrder', { patient: pid, status: 'active' }).at(-1)
  const dietType = order?.oralDiet?.type?.[0]
  const instruction = order?.oralDiet?.instruction
  // note is read loosely: the simulated Epic may not carry it yet.
  const note = (order as { note?: { text?: string }[] } | undefined)?.note?.[0]?.text
  const npo = dietType?.coding?.some((c) => c.code === NPO_CODE) ?? false
  const fluidLimitMl = order?.extension?.find((e) => e.url.endsWith(FLUID_LIMIT_EXT))
    ?.valueQuantity?.value

  // Only food allergies change the food menu (category read loosely, as above).
  const foodAllergies = store
    .search('AllergyIntolerance', { patient: pid })
    .filter((a) => (a as { category?: string[] }).category?.includes('food'))
    .map((a) => lowerFirst(a.code.text ?? ''))
    .filter(Boolean)

  const isolation = fact('Isolation')
  return {
    roomId,
    firstName: summary.name.split(' ')[0] ?? null,
    bed: summary.location.bed || null,
    chart: {
      ...(npo
        ? {
            npo: {
              title: `Nothing to eat or drink ${instruction ?? 'for now'}`,
              reason: note ?? DEFAULT_NPO_REASON,
            },
          }
        : dietType?.text && dietType.text !== 'Regular'
          ? { diet: dietType.text.endsWith('diet') ? dietType.text : `${dietType.text} diet` }
          : {}),
      ...(fluidLimitMl !== undefined ? { fluidLimitMl } : {}),
      foodAllergies,
      fallRisk: /^(high|medium)/i.test(fact('Fall risk')),
      ...(isolation && isolation !== 'None' ? { isolation } : {}),
    },
  }
}

/** Who is in the room and the chart facts that change what the tablet offers. */
export const readPatient = async (roomId: string): Promise<PatientInRoom> => {
  try {
    const epic = await fromEpic(roomId)
    if (epic) return epic
  } catch (error) {
    console.warn('[patient] could not read the hospital record, using demo data', error)
  }
  const demo = DEMO[roomId]
  return demo ? { roomId, ...demo } : { roomId, firstName: null, bed: null, chart: NO_LIMITS }
}
