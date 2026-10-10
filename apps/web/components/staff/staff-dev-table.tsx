'use client'

import {
  type CallRequest,
  NURSE_BUTTON,
  optionById,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUSES,
  type RequestStatus,
  TEAM_LABELS,
  TEAMS,
  type Team,
} from '@bell/core/taxonomy'
import Link from 'next/link'
import { useState } from 'react'
import { setRequestStatus } from '@/lib/client/api'
import { type LiveStatus, useLiveFeed } from '@/lib/client/use-live-feed'

const LIVE_LABELS: Record<LiveStatus, string> = {
  connecting: 'connecting…',
  live: 'live',
  reconnecting: 'reconnecting…',
}

const isStatus = (value: string): value is RequestStatus =>
  (REQUEST_STATUSES as readonly string[]).includes(value)

/** What the patient asked for: the option they tapped, the nurse button, or their own words. */
const requestLabel = (r: CallRequest): string => {
  if (r.optionId) return `${optionById(r.optionId).label} (${r.optionId})`
  if (r.source === 'nurse_button') return NURSE_BUTTON.label
  return r.text ? `“${r.text}” (${r.source})` : r.source
}

const cell = 'border border-border px-2 py-1 align-top'

/** Bare dev view of one team's requests. Not the hospital design. */
export function StaffDevTable({ team }: { team: Team }) {
  const {
    requests,
    liveStatus,
    loaded,
    upsertRequest: upsert,
  } = useLiveFeed({
    team,
    status: 'all',
    limit: 200,
  })
  const [error, setError] = useState<string | null>(null)

  const rows = [...requests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

  const changeStatus = async (id: string, status: RequestStatus) => {
    setError(null)
    try {
      upsert(await setRequestStatus(id, status))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  return (
    <main className="flex flex-col gap-4 p-4 text-caption text-ink">
      <p className="font-bold">Dev view, not the hospital design</p>
      <h1 className="font-body text-lead">
        {TEAM_LABELS[team]} ({team}): {rows.length} requests, stream {LIVE_LABELS[liveStatus]}
      </h1>
      <nav aria-label="Teams" className="flex flex-wrap gap-3">
        {TEAMS.map((t) => (
          <Link
            key={t}
            href={`/staff/${t}`}
            aria-current={t === team ? 'page' : undefined}
            className="underline"
          >
            {t}
          </Link>
        ))}
      </nav>
      {error ? <p role="alert">Error: {error}</p> : null}
      {!loaded ? (
        <p>Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                {[
                  'Room',
                  'Option or text',
                  'Team',
                  'Category',
                  'Urgency',
                  'Clinical',
                  'Confidence',
                  'Summary',
                  'Language',
                  'Route reason',
                  'Status',
                  'Created',
                ].map((heading) => (
                  <th key={heading} scope="col" className={cell}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={cell}>{r.roomId}</td>
                  <td className={cell}>{requestLabel(r)}</td>
                  <td className={cell}>{r.team}</td>
                  <td className={cell}>{r.category}</td>
                  <td className={cell}>{r.urgency}</td>
                  <td className={cell}>{r.clinical ? 'yes' : 'no'}</td>
                  <td className={cell}>{r.confidence === null ? '–' : r.confidence.toFixed(2)}</td>
                  <td className={cell}>{r.staffSummary}</td>
                  <td className={cell}>{r.language ?? '–'}</td>
                  <td className={cell}>{r.routeReason ?? '–'}</td>
                  <td className={cell}>
                    <select
                      aria-label={`Status of request from room ${r.roomId}`}
                      value={r.status}
                      onChange={(e) => {
                        if (isStatus(e.target.value)) void changeStatus(r.id, e.target.value)
                      }}
                      className="border border-border-strong bg-surface"
                    >
                      {REQUEST_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {REQUEST_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={cell}>
                    <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
