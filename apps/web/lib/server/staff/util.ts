// Small helpers shared by the staff service: ids, clock labels, room labels, tier order.

import { randomUUID } from 'node:crypto'
import type { Tier } from '@bell/core/staff-api'

export const newId = (prefix: string): string => `${prefix}_${randomUUID().slice(0, 12)}`

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  // The unit's wall clock. Defaults to the server's zone (the dev machine in local dev).
  timeZone: process.env.BELL_TIME_ZONE?.trim() || undefined,
})

/** "15:14" */
export const clock = (date: Date): string => clockFormat.format(date)

export const MINUTE = 60_000
/** Start of the current shift window for "today" lists (the last 16 hours). */
export const todayStart = (now = Date.now()): Date => new Date(now - 16 * 60 * MINUTE)

/** "416A", or "414" for a room without beds. */
export const bedLabel = (room: string, bed: string): string => `${room}${bed}`

/** "Room 416, Bed A", or "Room 414". */
export const roomLabel = (room: string, bed: string): string =>
  bed ? `Room ${room}, Bed ${bed}` : `Room ${room}`

export const TIER_RANK: Record<Tier, number> = { urgent: 0, high: 1, scheduled: 2, routine: 3 }

export const firstName = (name: string): string =>
  name.replace(/^Dr\.\s+/, '').split(' ')[0] ?? name

export const capitalize = (text: string): string =>
  text ? text.charAt(0).toUpperCase() + text.slice(1) : text

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
