import { readSessionToken, SESSION_COOKIE, sessionSecret } from '@bell/core/session'
import { type NextRequest, NextResponse } from 'next/server'

// Every page needs a signed-in staff member, except /login. The API checks the cookie itself.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const signedIn = token ? (await readSessionToken(token, sessionSecret())) !== null : false

  if (request.nextUrl.pathname === '/login') {
    return signedIn ? NextResponse.redirect(new URL('/incoming', request.url)) : NextResponse.next()
  }
  if (signedIn) return NextResponse.next()

  const back = request.nextUrl.clone()
  back.searchParams.delete('_rsc')
  const login = new URL('/login', request.url)
  login.searchParams.set('next', back.pathname + back.search)
  return NextResponse.redirect(login)
}

export const config = {
  // Skip the API, Next internals, staff photos and other static files.
  matcher: ['/((?!api/|_next/|staff/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)'],
}
