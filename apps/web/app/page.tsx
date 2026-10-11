import Link from 'next/link'
import { connection } from 'next/server'
import { tabletRooms } from '@/lib/patient/chart'

const linkClass =
  'flex min-h-tap items-center rounded-xl bg-surface px-6 py-4 text-lead text-action-ink shadow-raised hover:bg-action-tint'

export default async function HomePage() {
  // Rendered per request: the rooms come from the hospital record (Epic), read fresh.
  await connection()
  const rooms = await tabletRooms()
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-xl text-ink">Bell</h1>
        <p className="text-lead text-muted">Choose a room to open its bedside tablet.</p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rooms.map((room) => (
          <li key={room.roomId}>
            <Link href={`/room/${room.roomId}`} className={linkClass}>
              Room {room.roomId}
              {room.firstName ? ` · ${room.firstName}` : ''}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
