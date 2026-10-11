// In-memory FHIR store: read by type/id and a small search (patient/subject, code, category,
// status, _id, _count). Results keep insertion order. Loaded from the seed bundle.

import type { CodeableConcept, Resource, ResourceOf, ResourceType } from './fhir'

export type SearchParams = Record<string, string | undefined>

export interface FhirStore {
  types(): ResourceType[]
  read<T extends ResourceType>(type: T, id: string): ResourceOf<T> | null
  search<T extends ResourceType>(type: T, params?: SearchParams): ResourceOf<T>[]
  /** Replaces a resource (the simulated shift assignment is the only writer). */
  update(resource: Resource): void
}

/** Search parameters the store understands, for the CapabilityStatement. */
export const SEARCH_PARAMS = ['patient', 'subject', 'code', 'category', 'status', '_id', '_count']

type Loose = Record<string, unknown>

const concepts = (value: unknown): CodeableConcept[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value as CodeableConcept]

/** Token match: "code" or "system|code" against any coding of the concepts. */
const tokenMatch = (value: unknown, token: string) => {
  const [system, code] = token.includes('|') ? token.split('|') : [undefined, token]
  return concepts(value).some((c) =>
    c.coding?.some((k) => k.code === code && (system === undefined || k.system === system)),
  )
}

const refMatch = (r: Loose, token: string) => {
  const ref = token.includes('/') ? token : `Patient/${token}`
  if (r.resourceType === 'Patient') return `Patient/${r.id}` === ref
  const target = (r.subject ?? r.patient) as { reference?: string } | undefined
  return target?.reference === ref
}

const matches = (r: Loose, key: string, token: string): boolean => {
  switch (key) {
    case 'patient':
    case 'subject':
      return refMatch(r, token)
    case 'code':
      return tokenMatch(r.code ?? r.medicationCodeableConcept, token)
    case 'category':
      return tokenMatch(r.category, token)
    case 'status':
      return r.status === token
    case '_id':
      return r.id === token
    default:
      return true
  }
}

export function createFhirStore(resources: Resource[]): FhirStore {
  const byType = new Map<ResourceType, Map<string, Resource>>()
  const put = (r: Resource) => {
    const bucket = byType.get(r.resourceType) ?? new Map<string, Resource>()
    byType.set(r.resourceType, bucket)
    bucket.set(r.id, r)
  }
  for (const r of resources) put(r)

  return {
    types: () => [...byType.keys()],
    read: (type, id) => (byType.get(type)?.get(id) as ResourceOf<typeof type> | undefined) ?? null,
    search(type, params = {}) {
      const filters = Object.entries(params).filter(
        (e): e is [string, string] => e[0] !== '_count' && !!e[1],
      )
      const count = Number.parseInt(params._count ?? '', 10)
      const out: ResourceOf<typeof type>[] = []
      for (const r of byType.get(type)?.values() ?? []) {
        if (count >= 0 && out.length >= count) break
        // Comma-separated values are OR; separate parameters are AND.
        const ok = filters.every(([key, value]) =>
          value.split(',').some((token) => matches(r as unknown as Loose, key, token)),
        )
        if (ok) out.push(r as ResourceOf<typeof type>)
      }
      return out
    },
    update(resource) {
      put({ ...resource, meta: { ...resource.meta, lastUpdated: new Date().toISOString() } })
    },
  }
}
