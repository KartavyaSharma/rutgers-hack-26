import type { NextRequest } from 'next/server'
import { confirmAsk } from '@/lib/server/staff/ask'
import { respond, withStaff } from '@/lib/server/staff/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/staff/ask/[id]/confirm -> Task. 404 when the plan expired or is someone else's. */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/staff/ask/[id]/confirm'>) {
  const { id } = await ctx.params
  return withStaff(request, 'confirm ask', async (staff) => respond(await confirmAsk(staff, id)))
}
