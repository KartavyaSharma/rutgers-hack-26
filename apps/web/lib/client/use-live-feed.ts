'use client'

import type { CallRequest, StreamEvent, Team } from '@bell/core/taxonomy'
import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { listRequests } from './api'

export type LiveStatus = 'connecting' | 'live' | 'reconnecting'

const RETRY_MS = 5_000

const isNewer = (a: CallRequest, b: CallRequest): boolean =>
  Date.parse(a.updatedAt) >= Date.parse(b.updatedAt)

/** Insert or replace by id; an older copy never overwrites a newer one. */
export const upsertById = (list: CallRequest[], next: CallRequest): CallRequest[] => {
  const index = list.findIndex((item) => item.id === next.id)
  if (index === -1) return [next, ...list]
  const current = list[index]
  if (current && !isNewer(next, current)) return list
  const copy = list.slice()
  copy[index] = next
  return copy
}

interface Options {
  team?: Team
  room?: string
  /** Which requests the initial list loads: open ones (default) or all, newest first. */
  status?: 'open' | 'all'
  limit?: number
  onEvent?: (event: StreamEvent) => void
}

/**
 * Live requests: subscribes to /api/stream, then (re)loads /api/requests every time the stream
 * (re)connects so nothing is missed while offline. Events that arrive during a load are merged
 * on top of the loaded list.
 */
export const useLiveFeed = ({ team, room, status = 'open', limit, onEvent }: Options) => {
  const [requests, setRequests] = useState<CallRequest[]>([])
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

    let disposed = false
    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let loadSeq = 0
    let duringLoad: Map<string, CallRequest> | null = null

    const load = async () => {
      const seq = ++loadSeq
      duringLoad = new Map()
      try {
        const fresh = await listRequests(requestParams)
        if (disposed || seq !== loadSeq) return
        let merged = fresh
        for (const item of duringLoad.values()) merged = upsertById(merged, item)
        duringLoad = null
        setRequests(merged)
        setLoaded(true)
      } catch (error) {
        if (disposed || seq !== loadSeq) return
        console.error('[live] could not load', error)
        retryTimer = setTimeout(() => void load(), RETRY_MS)
      }
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
        if (!event.request) return
        const incoming = event.request
        if (duringLoad) {
          const prev = duringLoad.get(incoming.id)
          if (!prev || isNewer(incoming, prev)) duringLoad.set(incoming.id, incoming)
        }
        setRequests((prev) => upsertById(prev, incoming))
        handleEvent(event)
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      source?.close()
    }
  }, [team, room, status, limit])

  /** Apply what our own API call returned without waiting for the stream. */
  const upsertRequest = useCallback((request: CallRequest) => {
    setRequests((prev) => upsertById(prev, request))
  }, [])

  return { requests, liveStatus, loaded, upsertRequest }
}
