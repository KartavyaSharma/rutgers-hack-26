import type { NextRequest } from 'next/server'
import { badRequest, json } from '@/lib/server/http'
import { withStaff } from '@/lib/server/staff/http'
import { listPatients } from '@/lib/server/staff/patients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/staff/patients?scope=mine|floor (default mine) -> PatientRow[], the viewer's first. */
export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get('scope') ?? 'mine'
  if (scope !== 'mine' && scope !== 'floor') return badRequest('scope must be mine or floor')
  return withStaff(request, 'list patients', async (staff) =>
    json(await listPatients(staff, scope)),
  )
}
