import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

// Stroke icons on a 24px grid, drawn from the Main boards. Decorative by default
// (aria-hidden): every control that uses one also has a visible word or an aria-label.
const ICONS = {
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  check: <path d="M5 12l5 5 9-10" />,
  pencil: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  /** Alarm light, for "I need help immediately". */
  alert: (
    <>
      <path d="M7 18v-5a5 5 0 0 1 10 0v5" />
      <path d="M5 18h14v3H5z" />
      <path d="M12 2v2.5M4.5 5.5l1.6 1.6M19.5 5.5l-1.6 1.6" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  /** Points right; rotate for back. */
  chevron: <path d="M9 5l7 7-7 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  water: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  bathroom: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 7.5v6.5m0 0l-3.5 7m3.5-7l3.5 7M7.5 10.5h9" />
    </>
  ),
  comfort: (
    <path d="M4 8c0-1.5 1-2 2.5-2h11C19 6 20 6.5 20 8c-1 1.3-1 6.7 0 8 0 1.5-1 2-2.5 2h-11C5 18 4 17.5 4 16c1-1.3 1-6.7 0-8z" />
  ),
  move: <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />,
  beeping: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  cleaning: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  fix: (
    <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z" />
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" />
    </>
  ),
  nurse: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3 21v-.5A5.5 5.5 0 0 1 8.5 15h3a5.5 5.5 0 0 1 5.5 5.5v.5" />
      <path d="M19 3v6M16 6h6" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]

export interface IconProps extends Omit<ComponentProps<'svg'>, 'children'> {
  name: IconName
}

export function Icon({ name, className, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('size-6 shrink-0', className)}
      {...props}
    >
      {ICONS[name]}
    </svg>
  )
}

/** Request group ids (same strings as GroupId in @bell/core/taxonomy). */
export type GroupIconKey =
  | 'water_food'
  | 'bathroom'
  | 'comfort'
  | 'reposition'
  | 'beeping'
  | 'cleaning'
  | 'fix_something'
  | 'ask_care_team'

/** The icon for each request group, used for request cards and labels. */
export const GROUP_ICON: Record<GroupIconKey, IconName> = {
  water_food: 'water',
  bathroom: 'bathroom',
  comfort: 'comfort',
  reposition: 'move',
  beeping: 'beeping',
  cleaning: 'cleaning',
  fix_something: 'fix',
  ask_care_team: 'question',
}
