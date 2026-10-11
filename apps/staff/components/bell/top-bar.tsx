'use client'

import type { StaffMember } from '@bell/core/hospital'
import { cn } from 'cn'
import { ChevronDownIcon, LogOutIcon, SettingsIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PersonAvatar } from './person-avatar'

const tabs = [
  { href: '/incoming', label: 'Incoming' },
  { href: '/patients', label: 'Patients' },
  { href: '/tasks', label: 'Tasks' },
] as const

/** Local "15:14" and day/night shift, only after mount so server and client markup match. */
function useNow() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

const hhmm = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const shift = (d: Date) => (d.getHours() >= 7 && d.getHours() < 19 ? 'Day shift' : 'Night shift')

/** Bell mark, the three tabs (Incoming shows a count), the unit line and the signed-in person's menu. */
export function TopBar({
  staff,
  incomingCount,
  onLogout,
  meta,
}: {
  staff: StaffMember
  incomingCount?: number
  onLogout: () => void
  /** Replaces the unit line on the right, e.g. "4 West · 6 patients". The clock is added after it. */
  meta?: ReactNode
}) {
  const pathname = usePathname()
  const now = useNow()
  return (
    <header className="relative z-10 flex h-[60px] shrink-0 items-center gap-[18px] border-b border-border bg-background px-6">
      <Link href="/incoming" className="flex items-center gap-2 text-lg font-bold">
        <span aria-hidden className="size-2 rounded-full bg-foreground" />
        Bell
      </Link>
      <span aria-hidden className="h-6 w-px bg-border" />
      <nav aria-label="Views" className="flex gap-7 self-stretch">
        {tabs.map((t) => {
          const on = pathname.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 border-b-[3px] px-1 text-[15px] transition-colors outline-none focus-visible:bg-subtle',
                on
                  ? 'border-foreground font-bold text-foreground'
                  : 'border-transparent font-medium text-ink-soft hover:text-foreground',
              )}
            >
              {t.label}
              {t.href === '/incoming' && incomingCount ? (
                <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-bold text-primary-foreground tabular-nums">
                  {incomingCount}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>
      <span className="ml-auto text-sm whitespace-nowrap text-ink-soft">
        {meta ?? staff.unit}
        {now ? ` · ${hhmm(now)}` : ''}
      </span>
      <span aria-hidden className="h-6 w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-11 cursor-pointer items-center gap-2.5 rounded-full pr-2.5 pl-1 text-left transition-colors outline-none hover:bg-subtle focus-visible:ring-[3px] focus-visible:ring-ring/25 data-[state=open]:bg-subtle">
          <PersonAvatar person={staff} size="md" />
          <span className="flex flex-col">
            <b className="text-sm leading-tight">{staff.name}</b>
            <span className="text-xs leading-tight text-ink-soft">
              {staff.roleLabel}
              {now ? ` · ${shift(now)}` : ''}
            </span>
          </span>
          <ChevronDownIcon className="size-3 text-muted-foreground" strokeWidth={2.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="flex items-center gap-2.5 font-normal">
            <PersonAvatar person={staff} size="md" />
            <span className="flex min-w-0 flex-col">
              <b className="truncate text-sm">{staff.name}</b>
              <span className="truncate text-xs text-ink-soft">
                {staff.roleLabel} · {staff.unit}
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onLogout}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
