'use client'

import type { Person, Task, TaskStatus } from '@bell/core/staff-api'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/bell/empty-state'
import { Segmented } from '@/components/bell/segmented'
import { useStaff } from '@/components/shell/staff-context'
import { api } from '@/lib/api'
import { clock } from '@/lib/time'
import { useApi } from '@/lib/use-api'
import { AskBell } from './ask-bell'
import { columnDef } from './columns'
import { type FilterOption, FilterPill } from './filter-pill'
import { TaskBoard } from './task-board'
import { OrderBadge } from './task-card'

type Scope = 'mine' | 'everyone'

const URGENCY: FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'routine', label: 'Routine' },
]

// Rounds like "All your patients · 6 rooms" are not one patient.
const onePatient = (task: Task) => !/rooms$/i.test(task.room)

const now = () => clock(new Date().toISOString())

/** Tasks board: Show Mine / Everyone, filters, the Kanban, and Ask Bell at the bottom. */
export function TasksScreen() {
  const { staff } = useStaff()
  const [scope, setScope] = useState<Scope>('everyone')
  const [urgency, setUrgency] = useState('all')
  const [patient, setPatient] = useState('all')
  const tasks = useApi(`tasks:${scope}`, () => api.tasks(scope), { refreshMs: 15_000 })
  const { mutate } = tasks

  // Optimistic changes, laid over the server's list until the server answers.
  const [pending, setPending] = useState<Record<string, { seq: number; patch: Partial<Task> }>>({})
  const seq = useRef(0)

  const all = useMemo(
    () =>
      (tasks.data ?? []).map((t) => {
        const change = pending[t.id]
        return change ? { ...t, ...change.patch } : t
      }),
    [tasks.data, pending],
  )
  const patients = useMemo(
    () => [...new Set(all.filter(onePatient).map((t) => t.patientName))],
    [all],
  )
  const shown = useMemo(
    () =>
      all.filter(
        (t) =>
          (urgency === 'all' || t.tier === urgency) &&
          (patient === 'all' || t.patientName === patient),
      ),
    [all, urgency, patient],
  )
  const hasOrder = shown.some((t) => t.order && t.status !== 'done')

  const me: Person = {
    id: staff.id,
    name: staff.name,
    roleLabel: staff.roleLabel,
    photoUrl: staff.photoUrl,
  }

  /** Show the change now, save it, then take the server's version (or undo with a short note). */
  const change = async (
    task: Task,
    patch: Partial<Task>,
    save: () => Promise<Task>,
    done: string,
    failed: string,
  ) => {
    const mine = ++seq.current
    setPending((cur) => ({ ...cur, [task.id]: { seq: mine, patch } }))
    toast(done)
    try {
      const saved = await save()
      mutate((cur) => (cur ?? []).map((t) => (t.id === saved.id ? saved : t)))
    } catch {
      toast.error(failed)
    } finally {
      setPending((cur) => {
        if (cur[task.id]?.seq !== mine) return cur
        const { [task.id]: _, ...rest } = cur
        return rest
      })
    }
  }

  const move = (task: Task, status: TaskStatus) => {
    const to = columnDef(status)
    const back = columnDef(task.status).title
    void change(
      task,
      { status, timeLabel: `${to.moved} ${now()}` },
      () => api.moveTask(task.id, status),
      status === 'done' ? `Done: ${task.title}` : `Moved to ${to.title}: ${task.title}`,
      `Could not move “${task.title}”. It is back in ${back}.`,
    )
  }

  const take = (task: Task) =>
    void change(
      task,
      { status: 'assigned', owner: me, mine: true, timeLabel: `You took it ${now()}` },
      () => api.takeTask(task.id),
      `You took: ${task.title}`,
      `Could not take “${task.title}”. Please try again.`,
    )

  const added = (task: Task) => {
    if (scope === 'mine' && !task.mine) return
    mutate((cur) => [...(cur ?? []).filter((t) => t.id !== task.id), task])
  }

  const patientOptions: FilterOption[] = [
    { value: 'all', label: `All ${patients.length}` },
    ...patients.map((name) => ({ value: name, label: name })),
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[68px] shrink-0 items-center gap-3.5 px-6">
        <span className="text-sm text-ink-soft">Show</span>
        <Segmented
          label="Show"
          value={scope}
          onChange={(next) => {
            setScope(next)
            setPatient('all')
          }}
          options={[
            { value: 'mine', label: 'Mine' },
            { value: 'everyone', label: 'Everyone' },
          ]}
        />
        <FilterPill label="Urgency" value={urgency} options={URGENCY} onChange={setUrgency} />
        <FilterPill
          label="Patient"
          value={patient}
          options={patientOptions}
          onChange={setPatient}
        />
        {hasOrder ? (
          <span className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            <OrderBadge n={1} legend />
            Bell’s suggested order for you
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 px-6">
        {tasks.error && !tasks.data ? (
          <EmptyState title="Could not load tasks" detail="Bell will try again in a few seconds." />
        ) : (
          <TaskBoard tasks={shown} onMove={move} onTake={take} onDone={(t) => move(t, 'done')} />
        )}
      </div>

      <AskBell onAdded={added} />
    </div>
  )
}
