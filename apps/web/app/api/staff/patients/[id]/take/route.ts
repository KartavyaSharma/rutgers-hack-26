import type { NextRequest } from 'next/server'
import { respond, withStaff } from '@/lib/server/staff/http'
import { takePatient } from '@/lib/server/staff/patients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/staff/patients/[id]/take -> PatientRow
 * The signed-in nurse takes a patient with no nurse yet. 403 for non-nurses, 409 if taken.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/staff/patients/[id]/take'>,
) {
  const { id } = await ctx.params
  return withStaff(request, 'take patient', async (staff) => respond(await takePatient(staff, id)))
}
