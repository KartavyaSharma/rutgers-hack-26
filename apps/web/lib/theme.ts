import {
  DEFAULT_ROOM_SETTINGS,
  isLanguagePreference,
  isTheme,
  type RoomSettings,
  THEMES,
} from '@bell/core/taxonomy'

/** localStorage key for one room's settings (theme + language), kept on the tablet. */
export const roomSettingsKey = (roomId: string): string => `bell-room-settings:${roomId}`

/** Reads stored settings, falling back to the defaults field by field. */
export const parseRoomSettings = (raw: string | null): RoomSettings => {
  if (!raw) return DEFAULT_ROOM_SETTINGS
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof RoomSettings, unknown>> | null
    return {
      language: isLanguagePreference(value?.language)
        ? value.language
        : DEFAULT_ROOM_SETTINGS.language,
      theme: isTheme(value?.theme) ? value.theme : DEFAULT_ROOM_SETTINGS.theme,
    }
  } catch {
    return DEFAULT_ROOM_SETTINGS
  }
}

/**
 * Inline script for <head>: on /room/<id>, apply that room's saved theme before first paint.
 * Mirrors roomSettingsKey and the THEMES list; everything else stays on the default theme.
 */
export const themeBootScript = `try{var m=location.pathname.match(/^\\/room\\/([^/]+)/);if(m){var s=JSON.parse(localStorage.getItem(${JSON.stringify(roomSettingsKey(''))}+decodeURIComponent(m[1]))||'null');if(s&&${JSON.stringify(THEMES)}.indexOf(s.theme)>=0)document.documentElement.dataset.theme=s.theme}}catch(e){}`
