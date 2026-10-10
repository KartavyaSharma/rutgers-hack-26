import { TEAM_LABELS, TEAMS } from '@bell/core/taxonomy'
import Link from 'next/link'

const linkClass =
  'flex min-h-tap items-center rounded-xl bg-surface px-6 py-4 text-lead text-action-ink shadow-raised hover:bg-action-tint'

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-xl text-ink">Bell</h1>
        <p className="text-lead text-muted">
          A bedside call bell that sends each request to the right team.
        </p>
      </header>

      <section aria-labelledby="tablet-heading" className="flex flex-col gap-3">
        <h2 id="tablet-heading" className="text-title text-ink">
          Patient tablet
        </h2>
        <Link href="/room/412" className={linkClass}>
          Room 412
        </Link>
      </section>

      <section aria-labelledby="staff-heading" className="flex flex-col gap-3">
        <h2 id="staff-heading" className="text-title text-ink">
          Staff queues
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TEAMS.map((team) => (
            <li key={team}>
              <Link href={`/staff/${team}`} className={linkClass}>
                {TEAM_LABELS[team]}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="design-heading" className="flex flex-col gap-3">
        <h2 id="design-heading" className="text-title text-ink">
          Design
        </h2>
        <Link href="/design" className={linkClass}>
          Tokens and components
        </Link>
      </section>
    </main>
  )
}
