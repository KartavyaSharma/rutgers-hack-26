'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'

/** Only same-site paths, so a crafted link cannot send the nurse elsewhere after sign-in. */
const safeNext = (next?: string) =>
  next && /^\/(?![/\\])/.test(next) && !next.startsWith('/login') ? next : '/incoming'

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await api.login(email, password)
      router.replace(safeNext(next))
    } catch (e) {
      // lib/api reports the status in the message: 401 means a wrong email or password.
      const wrong = e instanceof ApiError && e.status === 401
      setError(wrong ? 'Email or password is wrong.' : 'Could not reach Bell. Please try again.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="text-ink-strong">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="text-[15px]"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-ink-strong">
          Password
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="text-[15px]"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-foreground">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        Sign in
      </Button>
      <p className="text-center text-[13px] text-muted-foreground">
        Demo: priya@bell.demo · password bell
      </p>
    </form>
  )
}
