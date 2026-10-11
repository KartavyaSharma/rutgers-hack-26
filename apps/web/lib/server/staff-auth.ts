// Who is signed in to the staff app: the `bell_staff` cookie holds a signed session token
// (see @bell/core/session). The staff app's /api proxy forwards the cookie here.

import type { StaffMember } from '@bell/core/hospital'
import {
  readSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_HOURS,
  sessionSecret,
} from '@bell/core/session'
import type { NextResponse } from 'next/server'
import { hospital } from './hospital'

const readCookie = (request: Request, name: string): string | undefined => {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim())
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

/** The signed-in staff member, or null when the request has no valid session. */
export const currentStaff = async (request: Request): Promise<StaffMember | null> => {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  const session = await readSessionToken(token, sessionSecret())
  return session ? hospital().staffById(session.staffId) : null
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
} as const

export const setSessionCookie = (response: NextResponse, token: string): NextResponse => {
  response.cookies.set(SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: SESSION_TTL_HOURS * 3600,
  })
  return response
}

export const clearSessionCookie = (response: NextResponse): NextResponse => {
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 })
  return response
}
