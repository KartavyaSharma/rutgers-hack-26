// The slice of FHIR R4 the simulated Epic uses. Shapes follow the spec (hl7.org/fhir/R4);
// only the fields we fill are typed.

export interface Coding {
  system?: string
  code?: string
  display?: string
}

export interface CodeableConcept {
  coding?: Coding[]
  text?: string
}

export interface Reference {
  reference?: string
  display?: string
}

export interface Identifier {
  system?: string
  value?: string
}

export interface Period {
  start?: string
  end?: string
}

export interface Quantity {
  value?: number
  unit?: string
  system?: string
  code?: string
}

export interface Range {
  low?: Quantity
  high?: Quantity
}

export interface Annotation {
  text: string
}

export interface ContactPoint {
  system?: 'phone' | 'email' | 'pager' | 'url' | 'other'
  value?: string
  use?: 'work' | 'home' | 'mobile'
}

export interface HumanName {
  text?: string
  family?: string
  given?: string[]
  prefix?: string[]
}

export interface Attachment {
  contentType?: string
  data?: string
  url?: string
  title?: string
}

export interface Extension {
  url: string
  valueString?: string
  valueCode?: string
  valueInteger?: number
  valueDateTime?: string
  valueQuantity?: Quantity
  valueBoolean?: boolean
}

interface Base {
  id: string
  meta?: { lastUpdated?: string }
  extension?: Extension[]
}

export interface Patient extends Base {
  resourceType: 'Patient'
  active?: boolean
  identifier?: Identifier[]
  name?: HumanName[]
  gender?: 'male' | 'female' | 'other' | 'unknown'
  birthDate?: string
  communication?: { language: CodeableConcept; preferred?: boolean }[]
}

export interface Practitioner extends Base {
  resourceType: 'Practitioner'
  active?: boolean
  name?: HumanName[]
  telecom?: ContactPoint[]
  photo?: Attachment[]
}

export interface PractitionerRole extends Base {
  resourceType: 'PractitionerRole'
  active?: boolean
  practitioner: Reference
  code?: CodeableConcept[]
  specialty?: CodeableConcept[]
  location?: Reference[]
  telecom?: ContactPoint[]
}

export interface Location extends Base {
  resourceType: 'Location'
  status?: 'active' | 'suspended' | 'inactive'
  name?: string
  identifier?: Identifier[]
  physicalType?: CodeableConcept
  partOf?: Reference
}

export interface Encounter extends Base {
  resourceType: 'Encounter'
  status: 'planned' | 'arrived' | 'in-progress' | 'finished'
  class: Coding
  subject: Reference
  participant?: { type?: CodeableConcept[]; individual?: Reference; period?: Period }[]
  period?: Period
  reasonCode?: CodeableConcept[]
  location?: { location: Reference; status?: 'active' | 'completed' }[]
}

export interface CareTeam extends Base {
  resourceType: 'CareTeam'
  status: 'active' | 'inactive'
  name?: string
  subject: Reference
  encounter?: Reference
  participant: { role?: CodeableConcept[]; member?: Reference; period?: Period }[]
}

export interface AllergyIntolerance extends Base {
  resourceType: 'AllergyIntolerance'
  clinicalStatus?: CodeableConcept
  verificationStatus?: CodeableConcept
  criticality?: 'low' | 'high' | 'unable-to-assess'
  category?: ('food' | 'medication' | 'environment' | 'biologic')[]
  code: CodeableConcept
  patient: Reference
  recordedDate?: string
  reaction?: { manifestation: CodeableConcept[] }[]
}

export interface Flag extends Base {
  resourceType: 'Flag'
  status: 'active' | 'inactive'
  category?: CodeableConcept[]
  code: CodeableConcept
  subject: Reference
  period?: Period
}

export interface NutritionOrder extends Base {
  resourceType: 'NutritionOrder'
  status: 'active' | 'on-hold' | 'completed'
  intent: 'order'
  patient: Reference
  encounter?: Reference
  dateTime: string
  orderer?: Reference
  oralDiet?: {
    type?: CodeableConcept[]
    texture?: { modifier?: CodeableConcept }[]
    instruction?: string
  }
  /** Patient-facing reason for the order, e.g. why they cannot eat yet. */
  note?: { text: string }[]
}

export interface Observation extends Base {
  resourceType: 'Observation'
  status: 'registered' | 'preliminary' | 'final' | 'amended'
  category?: CodeableConcept[]
  code: CodeableConcept
  subject: Reference
  encounter?: Reference
  effectiveDateTime?: string
  valueQuantity?: Quantity
  valueCodeableConcept?: CodeableConcept
  valueString?: string
  valueInteger?: number
  interpretation?: CodeableConcept[]
  note?: Annotation[]
  referenceRange?: { low?: Quantity; high?: Quantity; text?: string }[]
  component?: { code: CodeableConcept; valueQuantity?: Quantity }[]
}

export interface Dosage {
  text?: string
  asNeededBoolean?: boolean
  route?: CodeableConcept
}

export interface MedicationRequest extends Base {
  resourceType: 'MedicationRequest'
  status: 'active' | 'on-hold' | 'completed' | 'stopped'
  intent: 'order'
  medicationCodeableConcept: CodeableConcept
  subject: Reference
  encounter?: Reference
  authoredOn?: string
  requester?: Reference
  dosageInstruction?: Dosage[]
}

export interface MedicationAdministration extends Base {
  resourceType: 'MedicationAdministration'
  status: 'completed' | 'not-done' | 'in-progress'
  medicationCodeableConcept: CodeableConcept
  subject: Reference
  context?: Reference
  effectiveDateTime: string
  performer?: { actor: Reference }[]
  request?: Reference
}

export interface MedicationStatement extends Base {
  resourceType: 'MedicationStatement'
  status: 'active' | 'completed' | 'on-hold'
  category?: CodeableConcept
  medicationCodeableConcept: CodeableConcept
  subject: Reference
}

export interface DiagnosticReport extends Base {
  resourceType: 'DiagnosticReport'
  status: 'registered' | 'preliminary' | 'final'
  category?: CodeableConcept[]
  code: CodeableConcept
  subject: Reference
  encounter?: Reference
  effectiveDateTime?: string
  issued?: string
  imagingStudy?: Reference[]
  conclusion?: string
}

export interface ImagingStudy extends Base {
  resourceType: 'ImagingStudy'
  status: 'registered' | 'available'
  subject: Reference
  encounter?: Reference
  started?: string
  modality?: Coding[]
  description?: string
}

export interface ServiceRequest extends Base {
  resourceType: 'ServiceRequest'
  status: 'active' | 'completed' | 'revoked'
  intent: 'order'
  category?: CodeableConcept[]
  code: CodeableConcept
  subject: Reference
  encounter?: Reference
  occurrenceDateTime?: string
  requester?: Reference
}

export interface DocumentReference extends Base {
  resourceType: 'DocumentReference'
  status: 'current' | 'superseded'
  docStatus?: 'preliminary' | 'final'
  type?: CodeableConcept
  category?: CodeableConcept[]
  subject: Reference
  date: string
  author?: Reference[]
  content: { attachment: Attachment }[]
  context?: { encounter?: Reference[]; practiceSetting?: CodeableConcept }
}

export interface Condition extends Base {
  resourceType: 'Condition'
  clinicalStatus?: CodeableConcept
  category?: CodeableConcept[]
  code: CodeableConcept
  subject: Reference
}

export interface Device extends Base {
  resourceType: 'Device'
  status?: 'active' | 'inactive'
  type?: CodeableConcept
  safety?: CodeableConcept[]
  patient?: Reference
}

export type Resource =
  | Patient
  | Practitioner
  | PractitionerRole
  | Location
  | Encounter
  | CareTeam
  | AllergyIntolerance
  | Flag
  | NutritionOrder
  | Observation
  | MedicationRequest
  | MedicationAdministration
  | MedicationStatement
  | DiagnosticReport
  | ImagingStudy
  | ServiceRequest
  | DocumentReference
  | Condition
  | Device

export type ResourceType = Resource['resourceType']

export type ResourceOf<T extends ResourceType> = Extract<Resource, { resourceType: T }>

export interface Bundle<R = Resource> {
  resourceType: 'Bundle'
  id?: string
  type: 'collection' | 'searchset'
  timestamp?: string
  total?: number
  link?: { relation: string; url: string }[]
  entry?: { fullUrl?: string; resource: R; search?: { mode: 'match' } }[]
}

export interface OperationOutcome {
  resourceType: 'OperationOutcome'
  issue: { severity: 'error' | 'warning'; code: string; diagnostics?: string }[]
}
