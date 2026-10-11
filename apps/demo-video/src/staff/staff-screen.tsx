import type { AskPlan, IncomingItem, Task } from '@bell/core/staff-api'
import { ChevronDownIcon, Maximize2 } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { AskBellBar } from '@/components/bell/ask-bell-bar'
import { BellNotes } from '@/components/bell/bell-notes'
import { FactList } from '@/components/bell/fact-list'
import { PersonAvatar } from '@/components/bell/person-avatar'
import { PlanConfirm } from '@/components/bell/plan-confirm'
import { QuoteBlock } from '@/components/bell/quote-block'
import { RequestRow } from '@/components/bell/request-row'
import { SectionLabel } from '@/components/bell/section-label'
import { Segmented } from '@/components/bell/segmented'
import { ApproveBar } from '@/components/incoming/approve-bar'
import { askedMeta, firstName } from '@/components/incoming/format'
import { IncomingRail, type IncomingTab } from '@/components/incoming/incoming-rail'
import { PlanSection } from '@/components/incoming/plan-section'
import { RequestHeader } from '@/components/incoming/request-header'
import { FilterPill } from '@/components/tasks/filter-pill'
import { TaskBoard } from '@/components/tasks/task-board'
import { OrderBadge } from '@/components/tasks/task-card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ABOUT, PRIYA } from './data'

export const STAFF_WIDTH = 1360
export const STAFF_HEIGHT = 850

export interface StaffState {
  page: 'incoming' | 'tasks'
  incoming: {
    tab: IncomingTab
    items: IncomingItem[]
    selectedId?: string
    /** "See original" is open on the selected request's quote. */
    showOriginal?: boolean
  }
  tasks: {
    list: Task[]
    /** What is typed in the Ask Bell bar. */
    askText: string
    asking?: boolean
    plan?: AskPlan
  }
}

const noop = () => {}

/**
 * The staff app at 1360×850: the shell's top bar over Incoming or Tasks, laid out like
 * apps/staff/components/{shell,incoming,tasks} but driven by a plain state object. The pieces
 * that fetch (the shell, the About panel, the screens) are rebuilt here around the real parts.
 */
export function StaffScreen({ state }: { state: StaffState }) {
  const need = state.incoming.items.filter((i) => i.state === 'needs_ok')
  return (
    <div
      data-staff-screen=""
      className="flex flex-col bg-background font-sans text-foreground antialiased"
      style={{ width: STAFF_WIDTH, height: STAFF_HEIGHT }}
    >
      <TopBar page={state.page} incomingCount={need.length} />
      <main className="flex min-h-0 flex-1 flex-col">
        {state.page === 'incoming' ? (
          <IncomingView {...state.incoming} />
        ) : (
          <TasksView {...state.tasks} />
        )}
      </main>
    </div>
  )
}

/** apps/staff/components/bell/top-bar.tsx without the router, on a fixed 15:14 day shift. */
function TopBar({ page, incomingCount }: { page: StaffState['page']; incomingCount: number }) {
  const tabs = [
    { id: 'incoming', label: 'Incoming' },
    { id: 'patients', label: 'Patients' },
    { id: 'tasks', label: 'Tasks' },
  ] as const
  return (
    <header className="relative z-10 flex h-[60px] shrink-0 items-center gap-[18px] border-b border-border bg-background px-6">
      <span className="flex items-center gap-2 text-lg font-bold">
        <span aria-hidden className="size-2 rounded-full bg-foreground" />
        Bell
      </span>
      <span aria-hidden className="h-6 w-px bg-border" />
      <nav aria-label="Views" className="flex gap-7 self-stretch">
        {tabs.map((t) => {
          const on = t.id === page
          return (
            <span
              key={t.id}
              data-tab={t.id}
              className={cn(
                'flex items-center gap-2 border-b-[3px] px-1 text-[15px]',
                on
                  ? 'border-foreground font-bold text-foreground'
                  : 'border-transparent font-medium text-ink-soft',
              )}
            >
              {t.label}
              {t.id === 'incoming' && incomingCount ? (
                <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-bold text-primary-foreground tabular-nums">
                  {incomingCount}
                </span>
              ) : null}
            </span>
          )
        })}
      </nav>
      <span className="ml-auto text-sm whitespace-nowrap text-ink-soft">{PRIYA.unit} · 15:14</span>
      <span aria-hidden className="h-6 w-px bg-border" />
      <span className="flex h-11 items-center gap-2.5 rounded-full pr-2.5 pl-1">
        <PersonAvatar person={PRIYA} size="md" />
        <span className="flex flex-col">
          <b className="text-sm leading-tight">{PRIYA.name}</b>
          <span className="text-xs leading-tight text-ink-soft">{PRIYA.roleLabel} · Day shift</span>
        </span>
        <ChevronDownIcon className="size-3 text-muted-foreground" strokeWidth={2.5} />
      </span>
    </header>
  )
}

function IncomingView({ tab, items, selectedId, showOriginal }: StaffState['incoming']) {
  const need = items.filter((i) => i.state === 'needs_ok')
  const handled = items.filter((i) => i.state === 'handled')
  const list = tab === 'need' ? need : handled
  const selected = list.find((i) => i.id === selectedId) ?? list[0]
  return (
    <div className="flex min-h-0 flex-1 gap-5 px-6 pt-4 pb-6">
      <IncomingRail
        tab={tab}
        onTab={noop}
        counts={{ need: need.length, handled: handled.length }}
        items={list}
        selectedId={selected?.id}
        onSelect={noop}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-card">
        {selected ? <RequestDetail item={selected} showOriginal={showOriginal ?? false} /> : null}
      </main>
    </div>
  )
}

/** apps/staff/components/incoming/request-detail.tsx, with the About panel fed from data. */
function RequestDetail({ item, showOriginal }: { item: IncomingItem; showOriginal: boolean }) {
  const first = firstName(item.patientName)
  const open = item.state === 'needs_ok'
  return (
    <>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pt-6 pb-5">
          <RequestHeader item={item} />
          <div className="mt-[18px]" data-quote="">
            <Quote item={item} showOriginal={showOriginal} />
          </div>
          <div data-plan="">
            <PlanSection
              plan={item.plan}
              first={first}
              send={item.plan.send}
              youId={PRIYA.id}
              onRemove={open ? noop : undefined}
            />
          </div>
        </div>
        <AboutPanel patientId={item.patientId} first={first} />
      </div>
      <ApproveBar item={item} busy={false} onApprove={noop} onReject={noop} />
    </>
  )
}

/**
 * The real QuoteBlock keeps "See original" in its own state. To show it open, it is mounted
 * fresh and its own button is pressed before the frame paints.
 */
function Quote({ item, showOriginal }: { item: IncomingItem; showOriginal: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!showOriginal) return
    const button = [...(ref.current?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'See original',
    )
    button?.click()
  }, [showOriginal])
  return (
    <div ref={ref} key={`${item.id}:${showOriginal}`}>
      <QuoteBlock words={item.words} meta={askedMeta(item)} original={item.original} />
    </div>
  )
}

/** apps/staff/components/incoming/about-panel.tsx, without the fetch. */
function AboutPanel({ patientId, first }: { patientId: string; first: string }) {
  const about = ABOUT[patientId]
  return (
    <aside className="flex w-[340px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-[#EEE9E2] bg-[#FAF8F5] px-[22px] pt-[22px] pb-[18px]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <b className="text-base">About {first}</b>
          <Button variant="outline" size="sm">
            <Maximize2 />
            All details
          </Button>
        </div>
        {about ? (
          <BellNotes label="" size="sm">
            {about.notes}
          </BellNotes>
        ) : null}
      </div>
      {about ? <FactList facts={about.facts} labelWidth={76} /> : null}
      {about?.requests.length ? (
        <section className="flex flex-col">
          <SectionLabel className="mb-1">Also for {first}</SectionLabel>
          {about.requests.map((r) => (
            <RequestRow key={r.id} request={r} variant="stacked" />
          ))}
        </section>
      ) : null}
    </aside>
  )
}

/** apps/staff/components/tasks/tasks-screen.tsx and ask-bell.tsx, without the fetch. */
function TasksView({ list, askText, asking, plan }: StaffState['tasks']) {
  // The board keeps its own columns; remount it whenever a card changes column.
  const boardKey = list.map((t) => `${t.id}:${t.status}`).join('|')
  const patients = [
    ...new Set(list.filter((t) => !/rooms$/i.test(t.room)).map((t) => t.patientName)),
  ]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[68px] shrink-0 items-center gap-3.5 px-6">
        <span className="text-sm text-ink-soft">Show</span>
        <Segmented
          label="Show"
          value="everyone"
          onChange={noop}
          options={[
            { value: 'mine', label: 'Mine' },
            { value: 'everyone', label: 'Everyone' },
          ]}
        />
        <FilterPill
          label="Urgency"
          value="all"
          options={[{ value: 'all', label: 'All' }]}
          onChange={noop}
        />
        <FilterPill
          label="Patient"
          value="all"
          options={[{ value: 'all', label: `All ${patients.length}` }]}
          onChange={noop}
        />
        <span className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
          <OrderBadge n={1} legend />
          Bell’s suggested order for you
        </span>
      </div>
      <div className="min-h-0 flex-1 px-6">
        <TaskBoard key={boardKey} tasks={list} onMove={noop} onTake={noop} onDone={noop} />
      </div>
      <div className="relative shrink-0 px-6 pt-3.5 pb-5" data-ask="">
        {plan ? (
          <PlanConfirm
            plan={plan}
            onConfirm={noop}
            onEdit={noop}
            onCancel={noop}
            className="absolute inset-x-6 bottom-[78px] z-20"
          />
        ) : null}
        <AskText text={askText} />
        <AskBellBar
          onSubmit={noop}
          busy={asking ?? false}
          placeholder="Ask Bell anything or tell it what to do, like “Have Sam check May’s blood sugar at 4”"
        />
      </div>
    </div>
  )
}

/**
 * The real Ask Bell bar keeps its text in its own state; this types into its input the way a
 * person would (native value setter plus an input event), so React picks it up.
 */
function AskText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const input = ref.current?.parentElement?.querySelector<HTMLInputElement>('input[name="ask"]')
    if (!input || input.value === text) return
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return <span ref={ref} hidden />
}
