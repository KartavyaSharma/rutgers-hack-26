import { needsNurseNow } from '@bell/core/taxonomy'
import type { NextRequest } from 'next/server'
import { isAgentRequest } from '@/lib/server/auth'
import { createDraft, listDrafts } from '@/lib/server/drafts'
import { badRequest, json, readJsonObject, serverError } from '@/lib/server/http'
import { createRequest, fromDecision } from '@/lib/server/requests'
import { parseDraftInput, parseDraftQuery } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/drafts?room=&status= (default: pending, newest first). */
export async function GET(request: NextRequest) {
  const query = parseDraftQuery(request.nextUrl.searchParams)
  if (!query.ok) return badRequest(query.message)
  try {
    return json({ drafts: await listDrafts(query.value) })
  } catch (error) {
    return serverError(error, 'list drafts')
  }
}

/** POST /api/drafts (voice agent, Authorization: Bearer AGENT_SHARED_SECRET) body DraftInput -> 201 { draft }. */
export async function POST(request: NextRequest) {
  if (!isAgentRequest(request)) {
    return json({ error: 'unauthorized', message: 'Drafts need the agent secret' }, 401)
  }
  const body = await readJsonObject(request)
  if (!body.ok) return badRequest(body.message)
  const input = parseDraftInput(body.value)
  if (!input.ok) return badRequest(input.message)
  const { roomId, source, text, decision } = input.value

  try {
    // Safety net: something that needs the nurse now must never wait for a confirmation.
    // The agent should have used POST /api/requests; save it immediately instead of drafting.
    if (needsNurseNow(decision)) {
      const sent = await createRequest(fromDecision(roomId, source, text, decision))
      return json({ kind: 'sent', draft: null, request: sent }, 201)
    }

    const draft = await createDraft({
      roomId,
      source,
      text,
      decision,
      patientText: decision.patientReply,
    })
    return json({ draft }, 201)
  } catch (error) {
    return serverError(error, 'create draft')
  }
}
