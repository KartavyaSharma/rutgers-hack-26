'use client'

import type { RoomControlsState } from '@bell/core/adapters'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getRoomControls, type RoomControlsPatch, updateRoomControls } from '@/lib/client/api'

const applyPatch = (state: RoomControlsState, patch: RoomControlsPatch): RoomControlsState => ({
  ...state,
  ...(patch.lights !== undefined ? { lights: patch.lights } : {}),
  ...(patch.temperatureF !== undefined ? { temperatureF: patch.temperatureF } : {}),
  ...(patch.blinds !== undefined ? { blinds: patch.blinds } : {}),
  ...(patch.tv ? { tv: { ...state.tv, ...patch.tv } } : {}),
})

/** Lights, temperature, blinds and TV for the room. Changes show at once, then the server's answer wins. */
export const useRoomControls = (roomId: string) => {
  const [controls, setControls] = useState<RoomControlsState | null>(null)
  const [failed, setFailed] = useState(false)
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    const mine = ++seq.current
    try {
      const fresh = await getRoomControls(roomId)
      if (mine !== seq.current) return
      setControls(fresh)
      setFailed(false)
    } catch (error) {
      if (mine !== seq.current) return
      console.error('[controls] could not load', error)
      setFailed(true)
    }
  }, [roomId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const update = useCallback(
    async (patch: RoomControlsPatch) => {
      setControls((prev) => (prev ? applyPatch(prev, patch) : prev))
      const mine = ++seq.current
      try {
        const fresh = await updateRoomControls(roomId, patch)
        if (mine === seq.current) setControls(fresh)
      } catch (error) {
        console.error('[controls] could not update', error)
        if (mine === seq.current) void refresh()
      }
    },
    [roomId, refresh],
  )

  return { controls, failed, refresh, update }
}
