import type { NextRequest } from 'next/server'
import { isAgentRequest } from '@/lib/server/auth'
import { badRequest, json, notFound, readJsonObject, serverError } from '@/lib/server/http'
import {
  type ActionResult,
  addRequestNote,
  applyRequestAction,
  setRequestStatus,
} from '@/lib/server/requests'
import { isUuid, parseAction, parseNoteText, parseStatus } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH /api/requests/[id]
 * - { action: 'seen' | 'claim' | 'done' }: staff workflow steps (seen only moves a "sent" request).
 * - { action: 'cancel' }: the patient cancels an open request (409 if already done).
 * - { action: 'nudge' }: the patient taps "Still waiting?" (sets nudgedAt; 409 if closed).
 * - { action: 'add_note', text }: agent only (Authorization: Bearer AGENT_SHARED_SECRET), appends
 *   1-500 characters to notes.
 * - { status }: set the status directly (dev view), timestamps to match. Includes 'cancelled'.
 * Responses: 200 { request }, 400, 401 (add_note without the secret), 404, 409 { request }.
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

  let run: () => Promise<ActionResult>
  if (status !== undefined) {
    const parsed = parseStatus(status)
    if (!parsed.ok) return badRequest(parsed.message)
    run = () => setRequestStatus(id, parsed.value)
  } else {
    const parsed = parseAction(action)
    if (!parsed.ok) return badRequest(parsed.message)
    const value = parsed.value
    if (value === 'add_note') {
      // Check auth before validating the note so unauthenticated callers learn nothing.
      if (!isAgentRequest(request)) {
        return json({ error: 'unauthorized', message: 'Notes need the agent secret' }, 401)
      }
      const text = parseNoteText(body.value.text)
      if (!text.ok) return badRequest(text.message)
      run = () => addRequestNote(id, text.value)
    } else {
      run = () => applyRequestAction(id, value)
    }
  }

  try {
    const result = await run()
    switch (result.kind) {
      case 'not_found':
        return notFound()
      case 'conflict':
        return json({ error: 'conflict', message: result.message, request: result.request }, 409)
      case 'updated':
      case 'unchanged':
        return json({ request: result.request })
    }
  } catch (error) {
    return serverError(error, 'update request')
  }
}
