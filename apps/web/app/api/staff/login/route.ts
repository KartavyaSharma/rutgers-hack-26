import { createSessionToken, demoPassword, sessionSecret } from '@bell/core/session'
import type { Session } from '@bell/core/staff-api'
import { NextResponse } from 'next/server'
import { hospital } from '@/lib/server/hospital'
import { badRequest, json, readJsonObject, serverError } from '@/lib/server/http'
import { setSessionCookie } from '@/lib/server/staff-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const wrong = () => json({ error: 'unauthorized', message: 'Email or password is wrong.' }, 401)

/** POST /api/staff/login { email, password } -> Session, and sets the session cookie. */
export async function POST(request: Request) {
  const body = await readJsonObject(request)
  if (!body.ok) return badRequest(body.message)
  const { email, password } = body.value
  if (typeof email !== 'string' || typeof password !== 'string') return wrong()

  try {
    const staff = await hospital().staffByEmail(email.trim().toLowerCase())
    if (!staff || password !== demoPassword()) return wrong()
    const token = await createSessionToken(staff.id, sessionSecret())
    const session: Session = { staff }
    return setSessionCookie(
      NextResponse.json(session, { headers: { 'Cache-Control': 'no-store' } }),
      token,
    )
  } catch (error) {
    return serverError(error, 'staff login')
  }
}
