import type { NextRequest } from 'next/server'
import { badRequest } from '@/lib/server/http'
import { optionalString, readOptionalJson, respond, withStaff } from '@/lib/server/staff/http'
import { approveTicket } from '@/lib/server/staff/incoming'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/staff/incoming/[id]/approve { note?, sendIds? } -> IncomingItem
 * Sends Bell's plan as a task (sendIds = the people the nurse kept; [] = Bell answers alone).
 * 403 if the viewer is not the patient's nurse or the charge nurse, 409 if already rejected.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/staff/incoming/[id]/approve'>,
) {
  const { id } = await ctx.params
  return withStaff(request, 'approve incoming', async (staff) => {
    const body = await readOptionalJson(request)
    if (!body.ok) return badRequest(body.message)
    const note = optionalString(body.value.note, 'note', 1000)
    if (!note.ok) return badRequest(note.message)
    const { sendIds } = body.value
    if (
      sendIds !== undefined &&
      !(
        Array.isArray(sendIds) &&
        sendIds.length <= 20 &&
        sendIds.every((s) => typeof s === 'string')
      )
    ) {
      return badRequest('sendIds must be a list of ids')
    }
    return respond(await approveTicket(staff, id, { note: note.value, sendIds }))
  })
}
