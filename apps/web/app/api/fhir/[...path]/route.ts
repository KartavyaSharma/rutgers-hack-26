import { type ResourceType, SEARCH_PARAMS } from '@bell/epic'
import type { NextRequest } from 'next/server'
import { fhirStore } from '@/lib/server/hospital'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fhir = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/fhir+json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })

const notFound = (diagnostics: string): Response =>
  fhir(
    {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found', diagnostics }],
    },
    404,
  )

const capability = (types: ResourceType[], base: string) => ({
  resourceType: 'CapabilityStatement',
  status: 'active',
  date: new Date().toISOString(),
  kind: 'instance',
  software: { name: 'Bell simulated Epic' },
  implementation: { description: 'Read-only simulated Epic for unit 4 West', url: base },
  fhirVersion: '4.0.1',
  format: ['application/fhir+json'],
  rest: [
    {
      mode: 'server',
      resource: types.map((type) => ({
        type,
        interaction: [{ code: 'read' }, { code: 'search-type' }],
        searchParam: SEARCH_PARAMS.map((name) => ({
          name,
          type:
            name === 'patient' || name === 'subject'
              ? 'reference'
              : name === '_count'
                ? 'number'
                : 'token',
        })),
      })),
    },
  ],
})

/**
 * Read-only FHIR R4 view of the simulated Epic (the same store hospital() reads).
 * - GET /api/fhir/metadata: CapabilityStatement.
 * - GET /api/fhir/<Type>?patient=|subject=|code=|category=|status=|_id=|_count=: searchset Bundle.
 * - GET /api/fhir/<Type>/<id>: one resource.
 * Unknown types or ids: 404 OperationOutcome.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/fhir/[...path]'>) {
  const { path } = await ctx.params
  const [type, id, ...rest] = path
  const store = fhirStore()
  const base = `${request.nextUrl.origin}/api/fhir`

  if (type === 'metadata' && id === undefined) return fhir(capability(store.types(), base))

  const known = store.types().find((t) => t === type)
  if (!known || rest.length) return notFound(`Unknown resource type or path: ${path.join('/')}`)

  if (id !== undefined) {
    const resource = store.read(known, id)
    return resource ? fhir(resource) : notFound(`${known}/${id} not found`)
  }

  const { _count, ...params } = Object.fromEntries(request.nextUrl.searchParams)
  const matches = store.search(known, params)
  const count = Number.parseInt(_count ?? '', 10)
  const page = count >= 0 ? matches.slice(0, count) : matches
  return fhir({
    resourceType: 'Bundle',
    type: 'searchset',
    timestamp: new Date().toISOString(),
    total: matches.length,
    link: [{ relation: 'self', url: request.nextUrl.href }],
    entry: page.map((resource) => ({
      fullUrl: `${base}/${known}/${resource.id}`,
      resource,
      search: { mode: 'match' },
    })),
  })
}
