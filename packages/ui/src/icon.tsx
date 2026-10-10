import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

// 24x24 stroke icons drawn for this project. They inherit color from `currentColor`
// and are always decorative: the text next to them carries the meaning.
const ICONS = {
  water: (
    <>
      <path d="M6 3h12l-1.6 16.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8z" />
      <path d="M6.6 9h10.8" />
    </>
  ),
  bathroom: (
    <>
      <rect x="5" y="3" width="6" height="7" rx="1" />
      <path d="M3 10h18v1a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z" />
      <path d="M9 18l-1 3h8l-1-3" />
    </>
  ),
  comfort: (
    <>
      <path d="M4 6.5c3 1 13 1 16 0 1 3.5 1 7.5 0 11-3-1-13-1-16 0-1-3.5-1-7.5 0-11z" />
      <path d="M8 12c2.5.8 5.5.8 8 0" />
    </>
  ),
  move: (
    <>
      <path d="M3 21V9" />
      <path d="M3 16h18v5" />
      <path d="M7 13h4" />
      <path d="M16 12V3" />
      <path d="M13 6l3-3 3 3" />
    </>
  ),
  beeping: (
    <>
      <rect x="3" y="6" width="11" height="12" rx="2" />
      <path d="M5.5 12h1.75l1.25-2.5 1.5 5 1.25-2.5h1.25" />
      <path d="M17 9a4.5 4.5 0 0 1 0 6" />
      <path d="M19.5 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  cleaning: (
    <>
      <path d="M10 3l2 5.5 5.5 2-5.5 2L10 18l-2-5.5-5.5-2 5.5-2z" />
      <path d="M18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" />
      <path d="M19 3v4M17 5h4" />
    </>
  ),
  fix: (
    <path d="M14.5 4.5a4.5 4.5 0 0 0-4.2 6.1L4 16.9A2.2 2.2 0 0 0 7.1 20l6.3-6.3a4.5 4.5 0 0 0 6.1-4.2c0-.6-.1-1.1-.3-1.6l-2.7 2.7-2.6-.6-.6-2.6 2.7-2.7c-.5-.2-1-.3-1.6-.3z" />
  ),
  question: (
    <>
      <path d="M5 3h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M9.75 7.25a2.25 2.25 0 1 1 3.1 2.1c-.5.2-.85.65-.85 1.2v.7" />
      <path d="M12 13.25h.01" />
    </>
  ),
  nurse: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3 21v-.5A5.5 5.5 0 0 1 8.5 15h3a5.5 5.5 0 0 1 5.5 5.5v.5" />
      <path d="M19 3v6M16 6h6" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21M8.5 21h7" />
    </>
  ),
  'mic-off': (
    <>
      <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21M8.5 21h7" />
      <path d="M3.5 3.5l17 17" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8" />
    </>
  ),
  send: (
    <>
      <path d="M21 3L3 10.5l7.5 3 3 7.5z" />
      <path d="M10.5 13.5L21 3" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  alert: (
    <>
      <path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4.5M12 17.5h.01" />
    </>
  ),
  loader: <path d="M12 3a9 9 0 1 0 9 9" />,
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

/** Home request-group id (same strings as GroupId in @bell/core/taxonomy). */
export type GroupIconKey =
  | 'water_food'
  | 'bathroom'
  | 'comfort'
  | 'reposition'
  | 'beeping'
  | 'cleaning'
  | 'fix_something'
  | 'ask_care_team'

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

/** Old name for GROUP_ICON (group ids equal the old tile ids). */
export const TILE_ICON = GROUP_ICON
/** Old name for GroupIconKey. */
export type TileIconKey = GroupIconKey
