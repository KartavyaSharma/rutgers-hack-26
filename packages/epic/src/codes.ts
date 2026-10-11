// Code systems, codes and extension URLs shared by the seed and the mapping.

import type { StaffRole } from '@bell/core/hospital'

export const ROLE_LABEL: Record<StaffRole, string> = {
  nurse: 'RN',
  charge_nurse: 'Charge nurse',
  aide: 'Aide',
  pct: 'PCT',
  transport: 'Transport',
  case_manager: 'Case manager',
  doctor: 'Doctor',
}

const BELL = 'http://bell.demo/fhir'

export const SYS = {
  loinc: 'http://loinc.org',
  snomed: 'http://snomed.info/sct',
  ucum: 'http://unitsofmeasure.org',
  bcp47: 'urn:ietf:bcp:47',
  obsCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  interpretation: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
  flagCategory: 'http://terminology.hl7.org/CodeSystem/flag-category',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  locationType: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
  diagnosticService: 'http://terminology.hl7.org/CodeSystem/v2-0074',
  participationType: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
  allergyClinical: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  conditionClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  conditionCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  medStatementCategory: 'http://terminology.hl7.org/CodeSystem/medication-statement-category',
  docCategory: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category',
  dicom: 'http://dicom.nema.org/resources/ontology/DCM',
  deviceSafety: 'urn:oid:2.16.840.1.113883.3.26.1.1',
  // Bell's local systems for things Epic keeps in its own build.
  staffRole: `${BELL}/CodeSystem/staff-role`,
  local: `${BELL}/CodeSystem/local`,
  isolation: `${BELL}/CodeSystem/isolation`,
  room: `${BELL}/sid/room`,
  bed: `${BELL}/sid/bed`,
  mrn: `${BELL}/sid/mrn`,
} as const

export const EXT = {
  /** Watch item rank on a Flag: 1 shows first. */
  watchRank: `${BELL}/StructureDefinition/watch-rank`,
  /** Next dose on a MedicationRequest: valueDateTime, or valueString ("After MRI"). */
  nextDue: `${BELL}/StructureDefinition/next-due`,
  /** Daily fluid limit on a NutritionOrder (valueQuantity, mL). */
  fluidLimit: `${BELL}/StructureDefinition/fluid-limit`,
} as const

export const LOINC = {
  heartRate: '8867-4',
  bloodPressure: '85354-9',
  systolic: '8480-6',
  diastolic: '8462-4',
  oxygen: '59408-5',
  temperature: '8310-5',
  morseFall: '59460-6',
  wbc: '6690-2',
  hemoglobin: '718-7',
  sodium: '2951-2',
  potassium: '2823-3',
  creatinine: '2160-0',
  inr: '6301-6',
  bnp: '30934-4',
  glucose: '2345-7',
  a1c: '4548-4',
  progressNote: '11506-3',
  consultNote: '11488-4',
  edNote: '34111-5',
} as const

/** Local codes (SYS.local) for observations that have no settled LOINC code. */
export const LOCAL = {
  codeStatus: 'code-status',
  fluidIntake: 'fluid-intake-today',
  livingSituation: 'living-situation',
  mriSafetyForm: 'mri-safety-form',
  npo: 'npo',
} as const

export const SNOMED = {
  fullCode: '304252001',
  dnr: '304253006',
  noKnownAllergy: '716186003',
  fallRisk: '129839007',
  hearingLoss: '15188001',
  noCurrentProblems: '160245001',
  registeredNurse: '224535009',
  physician: '309343006',
} as const

/** Lab display: short name, unit and decimals, keyed by LOINC code. */
export const LABS: Record<
  string,
  { name: string; display: string; unit: string; decimals: number }
> = {
  [LOINC.wbc]: {
    name: 'WBC',
    display: 'Leukocytes [#/volume] in Blood by Automated count',
    unit: '10*3/uL',
    decimals: 1,
  },
  [LOINC.hemoglobin]: {
    name: 'Hemoglobin',
    display: 'Hemoglobin [Mass/volume] in Blood',
    unit: 'g/dL',
    decimals: 1,
  },
  [LOINC.sodium]: {
    name: 'Sodium',
    display: 'Sodium [Moles/volume] in Serum or Plasma',
    unit: 'mmol/L',
    decimals: 0,
  },
  [LOINC.potassium]: {
    name: 'Potassium',
    display: 'Potassium [Moles/volume] in Serum or Plasma',
    unit: 'mmol/L',
    decimals: 1,
  },
  [LOINC.creatinine]: {
    name: 'Creatinine',
    display: 'Creatinine [Mass/volume] in Serum or Plasma',
    unit: 'mg/dL',
    decimals: 1,
  },
  [LOINC.inr]: {
    name: 'INR',
    display: 'INR in Platelet poor plasma by Coagulation assay',
    unit: '{INR}',
    decimals: 1,
  },
  [LOINC.bnp]: {
    name: 'BNP',
    display: 'Natriuretic peptide B [Mass/volume] in Serum or Plasma',
    unit: 'pg/mL',
    decimals: 0,
  },
  [LOINC.glucose]: {
    name: 'Glucose',
    display: 'Glucose [Mass/volume] in Serum or Plasma',
    unit: 'mg/dL',
    decimals: 0,
  },
  [LOINC.a1c]: {
    name: 'A1c',
    display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
    unit: '%',
    decimals: 1,
  },
}

export const coding = (system: string, code: string, display?: string) =>
  display ? { system, code, display } : { system, code }

/** First code in a CodeableConcept from the given system. */
export const codeIn = (
  concept: { coding?: { system?: string; code?: string }[] } | undefined,
  system: string,
): string | undefined => concept?.coding?.find((c) => c.system === system)?.code
