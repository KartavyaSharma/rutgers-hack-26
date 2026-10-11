import { badRequest } from '@/lib/server/http'
import { askBell } from '@/lib/server/staff/ask'
import { readOptionalJson, respond, withStaff } from '@/lib/server/staff/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/staff/ask { text } -> AskPlan ("Bell will …"). Confirm it to create the task. */
export async function POST(request: Request) {
  return withStaff(request, 'ask bell', async (staff) => {
    const body = await readOptionalJson(request)
    if (!body.ok) return badRequest(body.message)
    const { text } = body.value
    if (typeof text !== 'string' || !text.trim()) return badRequest('text is required')
    if (text.length > 500) return badRequest('text must be at most 500 characters')
    return respond(await askBell(staff, text))
  })
}
