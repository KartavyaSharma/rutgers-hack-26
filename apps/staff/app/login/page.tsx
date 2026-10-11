import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { next } = await searchParams
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-card p-8">
        <span className="flex items-center gap-2 text-lg font-bold">
          <span className="size-2 rounded-full bg-foreground" />
          Bell
        </span>
        <h1 className="mt-6 text-2xl font-bold">Sign in</h1>
        <LoginForm next={typeof next === 'string' ? next : undefined} />
      </div>
    </main>
  )
}
