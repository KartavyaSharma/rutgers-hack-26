import type { NextRequest } from 'next/server'
import { badRequest } from '@/lib/server/http'
import { optionalString, readOptionalJson, respond, withStaff } from '@/lib/server/staff/http'
import { rejectTicket } from '@/lib/server/staff/incoming'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/staff/incoming/[id]/reject { team?, reason? } -> IncomingItem
 * No team and no reason: the request is rejected. With either: the reason is saved to memory and
 * Bell returns a new plan (state stays needs_ok) for the nurse to approve.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/staff/incoming/[id]/reject'>,
) {
  const { id } = await ctx.params
  return withStaff(request, 'reject incoming', async (staff) => {
    const body = await readOptionalJson(request)
    if (!body.ok) return badRequest(body.message)
    const team = optionalString(body.value.team, 'team', 80)
    if (!team.ok) return badRequest(team.message)
    const reason = optionalString(body.value.reason, 'reason', 1000)
    if (!reason.ok) return badRequest(reason.message)
    return respond(await rejectTicket(staff, id, { team: team.value, reason: reason.value }))
  })
}
