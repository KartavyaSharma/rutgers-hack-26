import type { NextRequest } from 'next/server'
import { respond, withStaff } from '@/lib/server/staff/http'
import { patientDetail } from '@/lib/server/staff/patients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/staff/patients/[id] -> PatientDetail (chart, Bell's notes, today's requests) | 404 */
export async function GET(request: NextRequest, ctx: RouteContext<'/api/staff/patients/[id]'>) {
  const { id } = await ctx.params
  return withStaff(request, 'patient detail', async (staff) =>
    respond(await patientDetail(staff, id)),
  )
}
