import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-display text-ink">Page not found</h1>
      <p className="text-lead text-muted">That room or team does not exist.</p>
      <Link
        href="/"
        className="inline-flex min-h-tap items-center self-start rounded-md bg-action px-6 text-lead text-on-action"
      >
        Go to the start page
      </Link>
    </main>
  )
}
