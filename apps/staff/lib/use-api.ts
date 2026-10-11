'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ApiState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  /** Fetch again, keeping the current data on screen. */
  refresh: () => Promise<void>
  /** Change the data locally (optimistic update). Call refresh() after the server answers. */
  mutate: (update: T | ((current: T | undefined) => T)) => void
}

/** Loads data from the Bell API. Refetches when `key` changes and every `refreshMs` when set. */
export function useApi<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { refreshMs?: number } = {},
): ApiState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const refresh = useCallback(async () => {
    try {
      const next = await fetcherRef.current()
      setData(next)
      setError(undefined)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when the key changes
  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [key, refresh])

  useEffect(() => {
    if (!options.refreshMs) return
    const timer = setInterval(() => void refresh(), options.refreshMs)
    return () => clearInterval(timer)
  }, [options.refreshMs, refresh])

  const mutate = useCallback((update: T | ((current: T | undefined) => T)) => {
    setData((current) =>
      typeof update === 'function' ? (update as (c: T | undefined) => T)(current) : update,
    )
  }, [])

  return { data, error, loading, refresh, mutate }
}
