import { cn } from 'cn'
import type { ReactNode } from 'react'
import { SectionLabel } from './section-label'

/** Bell's short, auto-generated notes paragraph for a patient, with where it came from. */
export function BellNotes({
  children,
  label = 'Bell’s notes',
  source = 'Written by Bell from Epic and today’s requests',
  action,
  size = 'md',
  className,
}: {
  children: ReactNode
  label?: string
  /** Small line under the notes. Pass an empty string to hide it. */
  source?: string
  action?: ReactNode
  /** md: 16 px (dialog). sm: 14 px (side panel). */
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      {label ? <SectionLabel action={action}>{label}</SectionLabel> : null}
      <p className={cn('m-0 leading-[1.55]', size === 'sm' ? 'text-sm' : 'text-base')}>
        {children}
      </p>
      {source ? <span className="text-xs text-muted-foreground">{source}</span> : null}
    </section>
  )
}
