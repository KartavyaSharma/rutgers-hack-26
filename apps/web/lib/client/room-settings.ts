import {
  DEFAULT_ROOM_SETTINGS,
  isLanguagePreference,
  type LanguagePreference,
  type RoomSettings,
} from '@bell/core/taxonomy'

// Per-room settings kept on the tablet. The theme is fixed to Clay for now, so only the
// language is stored; a separate flag remembers that the first-run language screen was done.

const settingsKey = (roomId: string) => `bell-room-settings:${roomId}`
const chosenKey = (roomId: string) => `bell-language-chosen:${roomId}`
const voiceOnlyKey = (roomId: string) => `bell-voice-only:${roomId}`

const safely = <T>(read: () => T, fallback: T): T => {
  try {
    return read()
  } catch {
    // Storage can be unavailable (private mode, blocked): fall back for this visit.
    return fallback
  }
}

export const loadRoomSettings = (roomId: string): RoomSettings =>
  safely(() => {
    const raw = localStorage.getItem(settingsKey(roomId))
    const value = raw ? (JSON.parse(raw) as { language?: unknown }) : null
    return {
      ...DEFAULT_ROOM_SETTINGS,
      language: isLanguagePreference(value?.language)
        ? value.language
        : DEFAULT_ROOM_SETTINGS.language,
    }
  }, DEFAULT_ROOM_SETTINGS)

export const saveRoomLanguage = (roomId: string, language: LanguagePreference): void =>
  safely(() => {
    localStorage.setItem(
      settingsKey(roomId),
      JSON.stringify({ ...DEFAULT_ROOM_SETTINGS, language }),
    )
    localStorage.setItem(chosenKey(roomId), '1')
  }, undefined)

/** True until the patient has picked a language on this tablet for this room. */
export const isFirstRun = (roomId: string): boolean =>
  safely(() => localStorage.getItem(chosenKey(roomId)) === null, false)

/** Voice only mode (the big mic home). On by default for now; off shows the category buttons. */
export const loadVoiceOnly = (roomId: string): boolean =>
  safely(() => localStorage.getItem(voiceOnlyKey(roomId)) !== '0', true)

export const saveVoiceOnly = (roomId: string, on: boolean): void =>
  safely(() => localStorage.setItem(voiceOnlyKey(roomId), on ? '1' : '0'), undefined)
