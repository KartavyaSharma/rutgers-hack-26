import { classifyRequest } from '@bell/core'
import type { NextRequest } from 'next/server'
import { badRequest, json, readJsonObject, serverError } from '@/lib/server/http'
import { parseText } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/classify { text } -> 200 RouteResult
 * Jev's answer for a piece of text, without saving or sending anything. The unit screens use it
 * to draft requests from a nurse's feedback.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonObject(request)
  if (!body.ok) return badRequest(body.message)
  const text = parseText(body.value.text)
  if (!text.ok) return badRequest(text.message)

  try {
    // classifyRequest never rejects: every failure comes back as a nurse decision.
    return json(await classifyRequest({ text: text.value }))
  } catch (error) {
    return serverError(error, 'classify text')
  }
}
