import { classifyRequest } from '@bell/core'
import { patientMessage } from '@bell/core/messages'
import { needsNurseNow, type RouteResponse } from '@bell/core/taxonomy'
import type { NextRequest } from 'next/server'
import { badRequest, json, readJsonObject, serverError } from '@/lib/server/http'
import { createRequest, fromDecision } from '@/lib/server/requests'
import { parseLanguage, parseRoomId, parseText } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/route { roomId, text, language? } -> 201 RouteResponse { request, message }
 * Typed text is classified by Jev (classifyRequest) and sent right away; there is no confirm
 * step (the patient can cancel it afterwards). `message` is "I've let your nurse know." when the
 * router fell back to the nurse for safety (needsNurseNow), else "Sent. Someone will be with you
 * soon.", in the patient's language.
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
    const sent = await createRequest(fromDecision(roomId.value, 'typed', text.value, decision))
    const response: RouteResponse = {
      request: sent,
      message: patientMessage(
        needsNurseNow(decision) ? 'nurse_notified' : 'sent',
        decision.language,
      ),
    }
    return json(response, 201)
  } catch (error) {
    return serverError(error, 'route typed request')
  }
}
