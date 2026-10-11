import type { Task, TaskStatus } from '@bell/core/staff-api'

export interface ColumnDef {
  status: TaskStatus
  title: string
  sub: string
  /** Short word for the time line right after a move, e.g. "Started 15:14". */
  moved: string
}

const DEFS: Record<TaskStatus, Omit<ColumnDef, 'status'>> = {
  needs_help: { title: 'Needs help', sub: 'Stuck, sent back or late', moved: 'Flagged' },
  waiting: { title: 'Waiting', sub: 'Nobody has it yet', moved: 'Waiting since' },
  assigned: { title: 'Assigned', sub: 'Given by a nurse or taken by staff', moved: 'Assigned' },
  in_progress: { title: 'In progress', sub: 'Someone is on it', moved: 'Started' },
  done: { title: 'Done', sub: 'Today', moved: 'Done' },
}

export const columnDef = (status: TaskStatus): ColumnDef => ({ status, ...DEFS[status] })

/** Board columns, left to right. */
export const COLUMNS: ColumnDef[] = (
  ['needs_help', 'waiting', 'assigned', 'in_progress', 'done'] as const
).map(columnDef)

export type Board = Record<TaskStatus, Task[]>

const emptyBoard = (): Board => ({
  needs_help: [],
  waiting: [],
  assigned: [],
  in_progress: [],
  done: [],
})

/** Sorts tasks into columns. Cards keep the order they had on `prev` (local reordering); new ones go last. */
export function arrange(tasks: Task[], prev?: Board): Board {
  const next = emptyBoard()
  for (const task of tasks) next[task.status]?.push(task)
  if (!prev) return next
  for (const { status } of COLUMNS) {
    const position = new Map(prev[status].map((t, i) => [t.id, i]))
    const at = (t: Task) => position.get(t.id) ?? Number.MAX_SAFE_INTEGER
    next[status].sort((a, b) => at(a) - at(b))
  }
  return next
}

/** The column a card or column id belongs to. */
export function columnOf(board: Board, id: string | number): TaskStatus | null {
  if (id in board) return id as TaskStatus
  for (const { status } of COLUMNS) {
    if (board[status].some((t) => t.id === id)) return status
  }
  return null
}
