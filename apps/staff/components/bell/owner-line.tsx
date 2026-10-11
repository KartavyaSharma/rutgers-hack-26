import type { Person } from '@bell/core/staff-api'
import { cn } from 'cn'
import { PersonAvatar } from './person-avatar'

/** Small avatar + "SAM KIM · PCT". Bottom of task cards. `inverted` is for the filled red urgent card. */
export function OwnerLine({
  person,
  inverted = false,
  className,
}: {
  person: Person
  inverted?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1.5',
        inverted ? 'text-white/[0.82]' : 'text-muted-foreground',
        className,
      )}
    >
      <PersonAvatar person={person} size="xs" />
      <span className="truncate text-[11px] font-bold tracking-[0.06em] uppercase">
        {person.name}
        {person.roleLabel ? ` · ${person.roleLabel}` : ''}
      </span>
    </span>
  )
}
