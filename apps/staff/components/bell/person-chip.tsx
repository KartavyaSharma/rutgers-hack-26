import type { Person } from '@bell/core/staff-api'
import { cn } from 'cn'
import { XIcon } from 'lucide-react'
import { PersonAvatar } from './person-avatar'

/** Photo + name + role in a pill. Used for "Send" in Bell's plan. */
export function PersonChip({ person, onRemove }: { person: Person; onRemove?: () => void }) {
  return (
    <span
      className={cn(
        'inline-flex h-[34px] max-w-full items-center gap-2 rounded-full border border-border bg-card pl-1 text-sm',
        onRemove ? 'pr-1.5' : 'pr-3.5',
      )}
    >
      <PersonAvatar person={person} size="sm" />
      <span className="truncate font-semibold">{person.name}</span>
      {person.roleLabel ? (
        <span className="whitespace-nowrap text-ink-soft">{person.roleLabel}</span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${person.name}`}
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-subtle text-ink-soft transition-colors outline-none hover:bg-column hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25"
        >
          <XIcon className="size-3" strokeWidth={2.5} />
        </button>
      ) : null}
    </span>
  )
}
