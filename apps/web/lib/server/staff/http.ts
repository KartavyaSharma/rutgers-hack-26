// Route helpers for /api/staff/*: auth, optional JSON bodies, and Result -> Response.

import type { StaffMember } from '@bell/core/hospital'
import { fail, json, ok, type Parsed, serverError } from '../http'
import { currentStaff } from '../staff-auth'
import type { Result } from './store'

const ERRORS = { 400: 'bad_request', 403: 'forbidden', 404: 'not_found', 409: 'conflict' } as const

export const respond = <T>(result: Result<T>): Response =>
  result.ok
    ? json(result.value)
    : json({ error: ERRORS[result.status], message: result.message }, result.status)

/** Runs a staff route as the signed-in staff member: 401 without a session, 500 on surprises. */
export const withStaff = async (
  request: Request,
  context: string,
  run: (staff: StaffMember) => Promise<Response>,
): Promise<Response> => {
  try {
    const staff = await currentStaff(request)
    if (!staff) return json({ error: 'unauthorized', message: 'Please sign in' }, 401)
    return await run(staff)
  } catch (error) {
    return serverError(error, context)
  }
}

/** A JSON object body, where an empty body counts as `{}`. */
export const readOptionalJson = async (
  request: Request,
): Promise<Parsed<Record<string, unknown>>> => {
  let text: string
  try {
    text = await request.text()
  } catch {
    return fail('Could not read the body')
  }
  if (!text.trim()) return ok({})
  try {
    const body: unknown = JSON.parse(text)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return fail('Body must be a JSON object')
    }
    return ok(body as Record<string, unknown>)
  } catch {
    return fail('Body must be valid JSON')
  }
}

/** An optional string field, trimmed, at most `max` characters. */
export const optionalString = (
  value: unknown,
  field: string,
  max: number,
): Parsed<string | undefined> => {
  if (value === undefined || value === null) return ok(undefined)
  if (typeof value !== 'string') return fail(`${field} must be a string`)
  const trimmed = value.trim()
  if (trimmed.length > max) return fail(`${field} must be at most ${max} characters`)
  return ok(trimmed || undefined)
}
