'use client'

import { DEFAULT_ROOM_SETTINGS, type RoomSettings } from '@bell/core/taxonomy'
import { useCallback, useEffect, useState } from 'react'
import { parseRoomSettings, roomSettingsKey } from '@/lib/theme'

const applyTheme = (theme: RoomSettings['theme']) => {
  document.documentElement.dataset.theme = theme
}

/** This room's language and theme, kept in localStorage on the tablet. */
export const useRoomSettings = (roomId: string) => {
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS)

  useEffect(() => {
    let stored = DEFAULT_ROOM_SETTINGS
    try {
      stored = parseRoomSettings(localStorage.getItem(roomSettingsKey(roomId)))
    } catch {
      // Storage unavailable: use the defaults.
    }
    setSettings(stored)
    applyTheme(stored.theme)
    // Leaving the room page puts the rest of the app back on the default theme.
    return () => applyTheme(DEFAULT_ROOM_SETTINGS.theme)
  }, [roomId])

  const update = useCallback(
    (patch: Partial<RoomSettings>) => {
      const next = { ...settings, ...patch }
      setSettings(next)
      applyTheme(next.theme)
      try {
        localStorage.setItem(roomSettingsKey(roomId), JSON.stringify(next))
      } catch {
        // Storage unavailable: the choice still applies for this visit.
      }
    },
    [roomId, settings],
  )

  return { settings, update }
}
