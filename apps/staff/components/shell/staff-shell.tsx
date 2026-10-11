'use client'

import type { StaffMember } from '@bell/core/hospital'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { TopBar } from '@/components/bell/top-bar'
import { Button } from '@/components/ui/button'
import { ApiError, api } from '@/lib/api'
import { useApi } from '@/lib/use-api'
import { StaffProvider } from './staff-context'

// lib/api throws ApiError 401 when the session is missing or expired.
const isSignedOut = (error: unknown) => error instanceof ApiError && error.status === 401

/** Loads who is signed in, keeps the Incoming count fresh, and draws the top bar above the page. */
export function StaffShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [staff, setStaff] = useState<StaffMember>()
  const [failed, setFailed] = useState(false)

  const toLogin = useCallback(
    () => router.replace(`/login?next=${encodeURIComponent(pathname)}`),
    [router, pathname],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: load the session once per mount
  useEffect(() => {
    let live = true
    api
      .me()
      .then((session) => live && setStaff(session.staff))
      .catch((error) => {
        if (!live) return
        if (isSignedOut(error)) toLogin()
        else setFailed(true)
      })
    return () => {
      live = false
    }
  }, [])

  const incoming = useApi('shell-incoming', api.incoming, { refreshMs: 15_000 })
  const incomingCount = incoming.data?.filter((item) => item.state === 'needs_ok').length

  // The session ran out mid-shift: back to sign in.
  useEffect(() => {
    if (isSignedOut(incoming.error)) toLogin()
  }, [incoming.error, toLogin])

  const refresh = incoming.refresh
  const value = useMemo(
    () => (staff ? { staff, refreshCounts: () => void refresh() } : null),
    [staff, refresh],
  )

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      // The cookie may already be gone; sign-in is the right place either way.
    }
    router.replace('/login')
  }

  if (failed) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p className="text-base">Could not reach Bell. Please try again.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    )
  }

  if (!value) return <div className="h-dvh bg-background" />

  return (
    <StaffProvider value={value}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <div className="shrink-0">
          <TopBar staff={value.staff} incomingCount={incomingCount} onLogout={logout} />
        </div>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </StaffProvider>
  )
}
