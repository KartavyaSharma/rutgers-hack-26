'use client'

import type { CallRequest, RequestDraft, StreamEvent, Team } from '@bell/core/taxonomy'
import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { listDrafts, listRequests } from './api'

export type LiveStatus = 'connecting' | 'live' | 'reconnecting'

const RETRY_MS = 5_000

type Versioned = { id: string; updatedAt: string }

const isNewer = (a: Versioned, b: Versioned): boolean =>
  Date.parse(a.updatedAt) >= Date.parse(b.updatedAt)

/** Insert or replace by id; an older copy never overwrites a newer one. */
export const upsertById = <T extends Versioned>(list: T[], next: T): T[] => {
  const index = list.findIndex((item) => item.id === next.id)
  if (index === -1) return [next, ...list]
  const current = list[index]
  if (current && !isNewer(next, current)) return list
  const copy = list.slice()
  copy[index] = next
  return copy
}

const mergeLoaded = <T extends Versioned>(fresh: T[], during: Map<string, T>): T[] => {
  let merged = fresh
  for (const item of during.values()) merged = upsertById(merged, item)
  return merged
}

interface Options {
  team?: Team
  room?: string
  /** Which requests the initial list loads: open ones (default) or all, newest first. */
  status?: 'open' | 'all'
  limit?: number
  /** Also load and follow the room's pending drafts (needs `room`; the stream only sends them then). */
  drafts?: boolean
  onEvent?: (event: StreamEvent) => void
}

/**
 * Live requests (and, for a room, drafts): subscribes to /api/stream, then (re)loads the lists
 * every time the stream (re)connects so nothing is missed while offline. Events that arrive
 * during a load are merged on top of the loaded lists.
 */
export const useLiveFeed = ({
  team,
  room,
  status = 'open',
  limit,
  drafts: withDrafts = false,
  onEvent,
}: Options) => {
  const [requests, setRequests] = useState<CallRequest[]>([])
  const [drafts, setDrafts] = useState<RequestDraft[]>([])
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting')
  const [loaded, setLoaded] = useState(false)
  const handleEvent = useEffectEvent((event: StreamEvent) => onEvent?.(event))

  useEffect(() => {
    const scope = new URLSearchParams()
    if (team) scope.set('team', team)
    if (room) scope.set('room', room)
    const requestParams = new URLSearchParams(scope)
    requestParams.set('status', status)
    if (limit) requestParams.set('limit', String(limit))
    const draftParams = new URLSearchParams({ room: room ?? '', status: 'pending' })
    const followDrafts = withDrafts && Boolean(room)

    let disposed = false
    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let loadSeq = 0
    let during: { requests: Map<string, CallRequest>; drafts: Map<string, RequestDraft> } | null =
      null

    const load = async () => {
      const seq = ++loadSeq
      during = { requests: new Map(), drafts: new Map() }
      try {
        const [freshRequests, freshDrafts] = await Promise.all([
          listRequests(requestParams),
          followDrafts ? listDrafts(draftParams) : Promise.resolve([]),
        ])
        if (disposed || seq !== loadSeq) return
        setRequests(mergeLoaded(freshRequests, during.requests))
        setDrafts(mergeLoaded(freshDrafts, during.drafts))
        during = null
        setLoaded(true)
      } catch (error) {
        if (disposed || seq !== loadSeq) return
        console.error('[live] could not load', error)
        retryTimer = setTimeout(() => void load(), RETRY_MS)
      }
    }

    const remember = <T extends Versioned>(map: Map<string, T> | undefined, item: T) => {
      if (!map) return
      const prev = map.get(item.id)
      if (!prev || isNewer(item, prev)) map.set(item.id, item)
    }

    const connect = () => {
      source = new EventSource(`/api/stream?${scope}`)
      source.onopen = () => {
        setLiveStatus('live')
        void load()
      }
      source.onerror = () => {
        if (disposed || !source) return
        setLiveStatus('reconnecting')
        // EventSource retries by itself unless the server refused the stream outright.
        if (source.readyState === EventSource.CLOSED) {
          source.close()
          retryTimer = setTimeout(connect, RETRY_MS)
        }
      }
      source.onmessage = (message: MessageEvent<string>) => {
        let event: StreamEvent
        try {
          event = JSON.parse(message.data) as StreamEvent
        } catch {
          return
        }
        if ('draft' in event) {
          if (!followDrafts) return
          const draft = event.draft
          remember(during?.drafts, draft)
          setDrafts((prev) => upsertById(prev, draft))
        } else {
          const request = event.request
          remember(during?.requests, request)
          setRequests((prev) => upsertById(prev, request))
        }
        handleEvent(event)
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      source?.close()
    }
  }, [team, room, status, limit, withDrafts])

  /** Apply what our own API call returned without waiting for the stream. */
  const upsertRequest = useCallback((request: CallRequest) => {
    setRequests((prev) => upsertById(prev, request))
  }, [])
  const upsertDraft = useCallback((draft: RequestDraft) => {
    setDrafts((prev) => upsertById(prev, draft))
  }, [])

  return { requests, drafts, liveStatus, loaded, upsertRequest, upsertDraft }
}
