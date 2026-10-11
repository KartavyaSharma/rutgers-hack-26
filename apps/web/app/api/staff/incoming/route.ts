import { json } from '@/lib/server/http'
import { withStaff } from '@/lib/server/staff/http'
import { listIncoming } from '@/lib/server/staff/incoming'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/staff/incoming -> IncomingItem[]: waiting for the viewer first, then handled today. */
export async function GET(request: Request) {
  return withStaff(request, 'list incoming', async (staff) => json(await listIncoming(staff)))
}
