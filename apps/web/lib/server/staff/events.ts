// Append-only event log helpers.

import type { Executor } from '../db'
import { events } from '../schema'
import type { EventType } from './types'
import { newId } from './util'

export interface NewEvent {
  type: EventType
  actor: string
  ticketId?: string | null
  taskId?: string | null
  patientId?: string | null
  data?: Record<string, unknown>
  at?: Date
}

export const logEvents = async (db: Executor, list: NewEvent[]): Promise<void> => {
  if (!list.length) return
  await db.insert(events).values(
    list.map((e) => ({
      id: newId('ev'),
      type: e.type,
      actor: e.actor,
      ticketId: e.ticketId ?? null,
      taskId: e.taskId ?? null,
      patientId: e.patientId ?? null,
      data: e.data ?? {},
      ...(e.at ? { createdAt: e.at } : {}),
    })),
  )
}
