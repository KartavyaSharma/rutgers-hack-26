// People and teams as the staff app shows them. Staff come from the hospital layer; teams that are
// not people (Food, Tech support, ...) are a config list here, with ids like `team:food`.

import type { StaffMember } from '@bell/core/hospital'
import type { Person } from '@bell/core/staff-api'
import type { Team } from '@bell/core/taxonomy'

export const personOf = (staff: StaffMember): Person => ({
  id: staff.id,
  name: staff.name,
  roleLabel: staff.roleLabel,
  ...(staff.photoUrl ? { photoUrl: staff.photoUrl } : {}),
})

const team = (slug: string, name: string): Person => ({ id: `team:${slug}`, name, roleLabel: '' })

export const TEAMS = {
  food: team('food', 'Food'),
  tech: team('tech', 'Tech support'),
  maintenance: team('maintenance', 'Maintenance'),
  housekeeping: team('housekeeping', 'Housekeeping'),
  interpreter: team('interpreter', 'Phone interpreter'),
  pt: team('pt', 'Physical therapy'),
} as const satisfies Record<string, Person>

export type TeamKey = keyof typeof TEAMS

/** Owner of a task nobody has taken yet (the board shows "I'll do it"). */
export const NOBODY: Person = { id: '', name: 'Nobody yet', roleLabel: '' }

export const isTeamId = (id: string): boolean => id.startsWith('team:')

export const teamById = (id: string): Person | null =>
  Object.values(TEAMS).find((t) => t.id === id) ?? null

/** Words a nurse might use for a team, in Ask Bell or a rejection reason. */
export const TEAM_WORDS: [RegExp, TeamKey][] = [
  [/\b(food|kitchen|cafeteria|dietary|meal tray)\b/i, 'food'],
  // Case-sensitive so "do it" is not IT.
  [/\b(?:[Tt]ech(?: support| desk)?|[Hh]elp ?desk|IT)\b/, 'tech'],
  [/\b(maintenance|facilities|engineering)\b/i, 'maintenance'],
  [/\b(housekeeping|environmental services|evs|cleaners?)\b/i, 'housekeeping'],
  [/\binterpreter\b/i, 'interpreter'],
  [/\b(pt|physical therapy|physio)\b/i, 'pt'],
]

/** A tablet/Jev team that maps straight to a non-person team. */
export const TEAM_FOR: Partial<Record<Team, TeamKey>> = {
  food: 'food',
  it: 'tech',
  facilities: 'maintenance',
  housekeeping: 'housekeeping',
}

/** Free agents who can be sent for hands-on help (never listed as assigned to a patient). */
export const isHelper = (staff: StaffMember): boolean =>
  staff.role === 'aide' || staff.role === 'pct'

export const isNurseRole = (staff: StaffMember): boolean =>
  staff.role === 'nurse' || staff.role === 'charge_nurse'
