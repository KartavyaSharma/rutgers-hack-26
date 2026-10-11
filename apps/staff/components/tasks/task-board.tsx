'use client'

import type { Task, TaskStatus } from '@bell/core/staff-api'
import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanItem,
  KanbanOverlay,
} from '@/components/ui/kanban'
import { arrange, type Board, COLUMNS, columnOf } from './columns'
import { TaskCard } from './task-card'

const taskId = (task: Task) => task.id

/**
 * The Kanban board: one column per status, drag a card to another column to move it.
 * Cards move live while dragging; `onMove` fires once on drop. Server refreshes wait until the card lands.
 */
export function TaskBoard({
  tasks,
  onMove,
  onTake,
  onDone,
}: {
  tasks: Task[]
  onMove: (task: Task, status: TaskStatus) => void
  onTake: (task: Task) => void
  onDone: (task: Task) => void
}) {
  const [board, setBoard] = useState<Board>(() => arrange(tasks))
  const [dragging, setDragging] = useState(false)
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null)
  const boardRef = useRef(board)
  boardRef.current = board
  const origin = useRef<{ id: string; status: TaskStatus; snapshot: Board } | null>(null)

  // Follow the server, but never while a card is in the air.
  useEffect(() => {
    if (!dragging) setBoard((prev) => arrange(tasks, prev))
  }, [tasks, dragging])

  // A small move before a drag starts, so the buttons on a card still click (and tablets still scroll).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const finish = () => {
    const from = origin.current
    origin.current = null
    setDragging(false)
    setOverColumn(null)
    return from
  }

  return (
    <Kanban
      value={board}
      onValueChange={(next) => setBoard(next as Board)}
      getItemValue={taskId}
      sensors={sensors}
      onDragStart={({ active }) => {
        const id = String(active.id)
        const status = columnOf(boardRef.current, id)
        if (!status) return
        origin.current = { id, status, snapshot: boardRef.current }
        setDragging(true)
      }}
      onDragOver={({ over }) => setOverColumn(over ? columnOf(boardRef.current, over.id) : null)}
      onDragEnd={({ over }) => {
        const from = finish()
        if (!from) return
        // Dropped outside the board: put everything back.
        if (!over) return setBoard(from.snapshot)
        const to = columnOf(boardRef.current, from.id)
        const task = to ? boardRef.current[to].find((t) => t.id === from.id) : undefined
        if (to && task && to !== from.status) onMove(task, to)
      }}
      onDragCancel={() => {
        const from = finish()
        if (from) setBoard(from.snapshot)
      }}
    >
      <KanbanBoard className="grid grid-cols-5 grid-rows-[minmax(0,1fr)] gap-4">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            value={col.status}
            asChild
            className={cn(
              'min-h-0 min-w-0 gap-0 rounded-[16px] border-0 bg-column p-0',
              overColumn === col.status && 'bg-[#E4DED5] shadow-[inset_0_0_0_2px_#CFC6BA]',
            )}
          >
            <section aria-label={col.title}>
              <div className="flex shrink-0 flex-col gap-0.5 px-4 pt-4 pb-3">
                <span className="flex items-baseline gap-2 text-[17px]">
                  <b>{col.title}</b>
                  <span className="text-muted-foreground tabular-nums">
                    {board[col.status].length}
                  </span>
                </span>
                <span className="text-[13px] text-ink-soft">{col.sub}</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
                {board[col.status].map((task) => (
                  <KanbanItem
                    key={task.id}
                    value={task.id}
                    asHandle
                    className="shrink-0 touch-manipulation rounded-[12px] data-dragging:opacity-40"
                  >
                    <TaskCard task={task} onTake={onTake} onDone={onDone} />
                  </KanbanItem>
                ))}
              </div>
            </section>
          </KanbanColumn>
        ))}
      </KanbanBoard>
      <KanbanOverlay>
        {({ value }) => {
          const task = Object.values(board)
            .flat()
            .find((t) => t.id === value)
          return task ? <TaskCard task={task} lifted /> : null
        }}
      </KanbanOverlay>
    </Kanban>
  )
}
