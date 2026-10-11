import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/server/staff-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/staff/logout -> { ok: true }, and clears the session cookie. */
export async function POST() {
  return clearSessionCookie(
    NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }),
  )
}
