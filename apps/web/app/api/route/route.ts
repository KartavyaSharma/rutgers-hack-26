import { classifyRequest } from '@bell/core'
import { draftReadBack, patientMessage } from '@bell/core/messages'
import { needsNurseNow, type RouteResponse } from '@bell/core/taxonomy'
import type { NextRequest } from 'next/server'
import { createDraft } from '@/lib/server/drafts'
import { badRequest, json, readJsonObject, serverError } from '@/lib/server/http'
import { createRequest, fromDecision } from '@/lib/server/requests'
import { parseLanguage, parseRoomId, parseText } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/route { roomId, text, language? } -> RouteResponse
 * Typed text is classified by Jev (classifyRequest) and becomes a pending draft the patient must
 * confirm, unless the nurse is needed now (red flag, clinical, classifier failure): then the
 * request is saved immediately. The draft's read-back is the patient's own words.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonObject(request)
  if (!body.ok) return badRequest(body.message)
  const roomId = parseRoomId(body.value.roomId)
  if (!roomId.ok) return badRequest(roomId.message)
  const text = parseText(body.value.text)
  if (!text.ok) return badRequest(text.message)
  const language = parseLanguage(body.value.language)
  if (!language.ok) return badRequest(language.message)

  try {
    // classifyRequest never rejects: every failure comes back as a nurse decision.
    const decision = await classifyRequest({ text: text.value, language: language.value })

    if (needsNurseNow(decision)) {
      const sent = await createRequest(fromDecision(roomId.value, 'typed', text.value, decision))
      const response: RouteResponse = {
        kind: 'sent',
        request: sent,
        message: patientMessage('nurse_notified', decision.language),
      }
      return json(response, 201)
    }

    const draft = await createDraft({
      roomId: roomId.value,
      source: 'typed',
      text: text.value,
      decision,
      patientText: decision.patientReply,
    })
    const response: RouteResponse = { kind: 'draft', draft, message: draftReadBack(decision) }
    return json(response, 201)
  } catch (error) {
    return serverError(error, 'route typed request')
  }
}
