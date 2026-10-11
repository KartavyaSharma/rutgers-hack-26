import type { Session } from '@bell/core/staff-api'
import { json, serverError } from '@/lib/server/http'
import { currentStaff } from '@/lib/server/staff-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/staff/me -> Session, or 401 when not signed in. */
export async function GET(request: Request) {
  try {
    const staff = await currentStaff(request)
    if (!staff) return json({ error: 'unauthorized', message: 'Please sign in.' }, 401)
    const session: Session = { staff }
    return json(session)
  } catch (error) {
    return serverError(error, 'staff me')
  }
}
