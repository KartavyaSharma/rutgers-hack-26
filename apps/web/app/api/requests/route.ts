import type { NextRequest } from 'next/server'
import { isAgentRequest } from '@/lib/server/auth'
import { badRequest, json, readJsonObject, serverError } from '@/lib/server/http'
import {
  createRequest,
  fromDecision,
  fromNurseButton,
  fromOption,
  listRequests,
} from '@/lib/server/requests'
import { parseCreateRequest, parseListQuery } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/requests?team=&room=&status= (default: open requests, newest first). */
export async function GET(request: NextRequest) {
  const query = parseListQuery(request.nextUrl.searchParams)
  if (!query.ok) return badRequest(query.message)
  try {
    return json({ requests: await listRequests(query.value) })
  } catch (error) {
    return serverError(error, 'list requests')
  }
}

/**
 * POST /api/requests
 * - Tablet buttons: { roomId, source: 'tile', optionId } or { roomId, source: 'nurse_button' }. No auth.
 * - Voice agent: { roomId, source: 'voice', text, decision } with Authorization: Bearer AGENT_SHARED_SECRET.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonObject(request)
  if (!body.ok) return badRequest(body.message)

  // Check auth before validating a routed body so unauthenticated callers learn nothing.
  if (body.value.source === 'voice' && !isAgentRequest(request)) {
    return json({ error: 'unauthorized', message: 'Routed requests need the agent secret' }, 401)
  }

  const input = parseCreateRequest(body.value)
  if (!input.ok) return badRequest(input.message)

  const parsed = input.value
  const newRequest =
    parsed.kind === 'routed'
      ? fromDecision(parsed.roomId, parsed.source, parsed.text, parsed.decision)
      : parsed.source === 'tile'
        ? fromOption(parsed.roomId, parsed.optionId)
        : fromNurseButton(parsed.roomId)

  try {
    return json({ request: await createRequest(newRequest) }, 201)
  } catch (error) {
    return serverError(error, 'create request')
  }
}
