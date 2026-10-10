// Small JSON helpers shared by the route handlers.

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export const badRequest = (message: string): Response =>
  json({ error: 'bad_request', message }, 400)

export const notFound = (message = 'Request not found'): Response =>
  json({ error: 'not_found', message }, 404)

export const serverError = (error: unknown, context: string): Response => {
  console.error(`[api] ${context}`, error)
  return json({ error: 'server_error', message: 'Something went wrong. Please try again.' }, 500)
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

export const ok = <T>(value: T): Parsed<T> => ({ ok: true, value })
export const fail = <T = never>(message: string): Parsed<T> => ({ ok: false, message })

/** Reads a JSON object body. Anything else (empty, invalid JSON, arrays) is a 400. */
export const readJsonObject = async (
  request: Request,
): Promise<Parsed<Record<string, unknown>>> => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('Body must be valid JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail('Body must be a JSON object')
  }
  return ok(body as Record<string, unknown>)
}
