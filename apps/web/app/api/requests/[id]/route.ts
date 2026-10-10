import type { NextRequest } from 'next/server'
import { badRequest, json, notFound, readJsonObject, serverError } from '@/lib/server/http'
import { applyRequestAction, setRequestStatus } from '@/lib/server/requests'
import { isUuid, parseAction, parseStatus } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH /api/requests/[id]
 * - { action: 'seen' | 'claim' | 'done' }: staff workflow steps (seen only moves a "sent" request).
 * - { status: 'sent' | 'seen' | 'on_the_way' | 'done' }: set the status directly, timestamps to match.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/requests/[id]'>) {
  const { id } = await ctx.params
  if (!isUuid(id)) return notFound()

  const body = await readJsonObject(request)
  if (!body.ok) return badRequest(body.message)
  const { action, status } = body.value
  if ((action === undefined) === (status === undefined)) {
    return badRequest('Send either action or status')
  }

  let run: () => ReturnType<typeof setRequestStatus>
  if (status !== undefined) {
    const parsed = parseStatus(status)
    if (!parsed.ok) return badRequest(parsed.message)
    run = () => setRequestStatus(id, parsed.value)
  } else {
    const parsed = parseAction(action)
    if (!parsed.ok) return badRequest(parsed.message)
    run = () => applyRequestAction(id, parsed.value)
  }

  try {
    const result = await run()
    switch (result.kind) {
      case 'not_found':
        return notFound()
      case 'conflict':
        return json({ error: 'conflict', message: result.message, request: result.request }, 409)
      default:
        return json({ request: result.request })
    }
  } catch (error) {
    return serverError(error, 'update request')
  }
}
