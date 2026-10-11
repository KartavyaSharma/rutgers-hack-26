import type { TaskStatus } from '@bell/core/staff-api'
import type { NextRequest } from 'next/server'
import { badRequest } from '@/lib/server/http'
import { readOptionalJson, respond, withStaff } from '@/lib/server/staff/http'
import { moveTask, TASK_STATUSES } from '@/lib/server/staff/tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH /api/staff/tasks/[id] { status?, take? } -> Task
 * status moves it to a board column; take: true makes the viewer the owner (and moves a
 * waiting or stuck task to assigned unless a status is given).
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/staff/tasks/[id]'>) {
  const { id } = await ctx.params
  return withStaff(request, 'update task', async (staff) => {
    const body = await readOptionalJson(request)
    if (!body.ok) return badRequest(body.message)
    const { status, take } = body.value
    if (status !== undefined && !TASK_STATUSES.includes(status as TaskStatus)) {
      return badRequest(`status must be one of ${TASK_STATUSES.join(', ')}`)
    }
    if (take !== undefined && typeof take !== 'boolean')
      return badRequest('take must be true or false')
    if (status === undefined && !take) return badRequest('Send status or take: true')
    return respond(
      await moveTask(staff, id, { status: status as TaskStatus | undefined, take: take === true }),
    )
  })
}
