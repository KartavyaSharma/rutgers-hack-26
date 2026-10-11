import type { Person } from '@bell/core/staff-api'
import { cn } from 'cn'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export const initials = (name: string) =>
  name
    .replace(/^Dr\.\s*/, '')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

// 22 px owner line, 26 px chip, 32 px menus and care team, 40 px large.
const sizes = {
  xs: 'size-[22px] text-[9px]',
  sm: 'size-[26px] text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
} as const

/** Round photo, or initials when there is no photo. */
export function PersonAvatar({
  person,
  size = 'md',
  className,
}: {
  person: Pick<Person, 'name' | 'photoUrl'>
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <Avatar className={cn(sizes[size], className)}>
      {person.photoUrl ? <AvatarImage src={person.photoUrl} alt="" /> : null}
      <AvatarFallback>{initials(person.name)}</AvatarFallback>
    </Avatar>
  )
}
