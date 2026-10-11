import type { NextRequest } from 'next/server'
import { badRequest, json } from '@/lib/server/http'
import { withStaff } from '@/lib/server/staff/http'
import { listTasks } from '@/lib/server/staff/tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/staff/tasks?scope=mine|everyone (default everyone) -> Task[]
 * mine = the viewer's tasks plus stuck ones for their patients. Done ones are today's only.
 */
export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get('scope') ?? 'everyone'
  if (scope !== 'mine' && scope !== 'everyone') return badRequest('scope must be mine or everyone')
  return withStaff(request, 'list tasks', async (staff) => json(await listTasks(staff, scope)))
}
