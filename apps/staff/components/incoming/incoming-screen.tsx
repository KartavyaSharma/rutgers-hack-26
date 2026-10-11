'use client'

import type { IncomingItem } from '@bell/core/staff-api'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/bell/empty-state'
import { useStaff } from '@/components/shell/staff-context'
import { api } from '@/lib/api'
import { useApi } from '@/lib/use-api'
import { joinNames } from './format'
import { IncomingRail, type IncomingTab } from './incoming-rail'
import { type RejectBody, RejectDialog } from './reject-dialog'
import { RequestDetail } from './request-detail'

/** Incoming: the nurse approves Bell's plan for each patient request. */
export function IncomingScreen() {
  const { staff, refreshCounts } = useStaff()
  const incoming = useApi('incoming', api.incoming, { refreshMs: 10000 })
  const [tab, setTab] = useState<IncomingTab>('need')
  const [selectedId, setSelectedId] = useState<string>()
  // People the nurse took off a plan before approving, by request id.
  const [removed, setRemoved] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const items = incoming.data ?? []
  const need = items.filter((i) => i.state === 'needs_ok')
  const handled = items.filter((i) => i.state === 'handled')
  const list = tab === 'need' ? need : handled
  const selected = list.find((i) => i.id === selectedId) ?? list[0]
  const send = selected
    ? selected.plan.send.filter((p) => !removed[selected.id]?.includes(p.id))
    : []

  // Show the new state right away, move on to the next request, then sync with the server.
  async function act(run: (item: IncomingItem) => Promise<IncomingItem>, done: string) {
    if (!selected) return
    const at = list.indexOf(selected)
    const next = list[at + 1] ?? list[at - 1]
    setBusy(true)
    try {
      const updated = await run(selected)
      incoming.mutate((current) => (current ?? []).map((i) => (i.id === updated.id ? updated : i)))
      setSelectedId(next?.id)
      setRejecting(false)
      toast(done)
      refreshCounts()
      void incoming.refresh()
    } catch {
      toast.error('Could not reach Bell. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const approve = () => {
    if (!selected) return
    const names = send.map((p) => (p.id === staff.id ? 'you' : p.name))
    void act(
      (item) => api.approve(item.id, { sendIds: send.map((p) => p.id) }),
      names.length ? `Sent to ${joinNames(names)}` : `Approved for ${selected.patientName}`,
    )
  }

  const reject = (body: RejectBody) => {
    if (!selected) return
    void act(
      (item) => api.reject(item.id, body),
      body.team
        ? `Sent back. Bell will pass it to ${body.team}`
        : `Plan rejected for ${selected.patientName}`,
    )
  }

  const removePerson = (personId: string) => {
    if (!selected) return
    const id = selected.id
    setRemoved((r) => ({ ...r, [id]: [...(r[id] ?? []), personId] }))
  }

  const railMessage = incoming.error
    ? 'Could not reach Bell. Trying again.'
    : incoming.data
      ? undefined
      : 'Loading requests…'

  return (
    <div className="flex min-h-0 flex-1 gap-5 px-6 pt-4 pb-6">
      <IncomingRail
        tab={tab}
        onTab={(t) => {
          setTab(t)
          setSelectedId(undefined)
        }}
        counts={incoming.data ? { need: need.length, handled: handled.length } : undefined}
        items={list}
        selectedId={selected?.id}
        onSelect={setSelectedId}
        message={railMessage}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-card">
        {selected ? (
          <RequestDetail
            item={selected}
            send={send}
            youId={staff.id}
            busy={busy}
            refreshKey={`${need.length}:${handled.length}`}
            onRemove={removePerson}
            onApprove={approve}
            onReject={() => setRejecting(true)}
          />
        ) : incoming.data ? (
          <div className="flex flex-1 items-center justify-center">
            {tab === 'need' ? (
              <EmptyState
                title="Nothing to approve"
                detail="New requests from patients show up here."
              />
            ) : (
              <EmptyState
                title="Nothing handled yet"
                detail="Requests Bell sends on its own show up here."
              />
            )}
          </div>
        ) : null}
      </main>
      {selected ? (
        <RejectDialog
          key={selected.id}
          open={rejecting}
          onOpenChange={setRejecting}
          busy={busy}
          onSend={reject}
        />
      ) : null}
    </div>
  )
}
