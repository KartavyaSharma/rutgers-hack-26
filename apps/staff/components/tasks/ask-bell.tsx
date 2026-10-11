'use client'

import type { AskPlan, Task } from '@bell/core/staff-api'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { AskBellBar } from '@/components/bell/ask-bell-bar'
import { PlanConfirm } from '@/components/bell/plan-confirm'
import { api } from '@/lib/api'

/** Ask Bell bar at the bottom of the board, with Bell's plan floating just above it. */
export function AskBell({ onAdded }: { onAdded: (task: Task) => void }) {
  const [plan, setPlan] = useState<AskPlan | null>(null)
  const [asking, setAsking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const clearText = useRef<(() => void) | null>(null)
  const root = useRef<HTMLDivElement>(null)

  // The bar empties itself when this promise resolves. It stays pending while the plan is open,
  // so "Change" leaves the words in the bar to edit, and a failed ask keeps them too.
  const ask = (text: string) =>
    new Promise<void>((resolve) => {
      setAsking(true)
      api
        .ask(text)
        .then((next) => {
          clearText.current = resolve
          setPlan(next)
        })
        .catch(() => toast.error('Bell could not answer that. Please try again.'))
        .finally(() => setAsking(false))
    })

  const close = () => {
    clearText.current?.()
    clearText.current = null
    setPlan(null)
  }

  const edit = () => {
    setPlan(null)
    root.current?.querySelector<HTMLInputElement>('input[name="ask"]')?.focus()
  }

  const confirm = async () => {
    if (!plan) return
    setConfirming(true)
    try {
      const task = await api.confirmAsk(plan.id)
      onAdded(task)
      toast(
        task.mine || !task.owner?.name
          ? `Added to your tasks: ${task.title}`
          : `Sent to ${task.owner.name}`,
      )
      close()
    } catch {
      toast.error('Bell could not do that. Please try again.')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div ref={root} className="relative shrink-0 px-6 pt-3.5 pb-5">
      {plan ? (
        <PlanConfirm
          plan={plan}
          busy={confirming}
          onConfirm={confirm}
          onEdit={edit}
          onCancel={close}
          className="absolute inset-x-6 bottom-[78px] z-20"
        />
      ) : null}
      <AskBellBar
        onSubmit={ask}
        busy={asking}
        placeholder="Ask Bell anything or tell it what to do, like “Have Sam check May’s blood sugar at 4”"
      />
    </div>
  )
}
