'use client'

import {
  isLanguagePreference,
  isTheme,
  LANGUAGES,
  type RoomSettings,
  THEMES,
  type Theme,
} from '@bell/core/taxonomy'
import { useId } from 'react'

const THEME_LABELS: Record<Theme, string> = {
  linen: 'Linen',
  clay: 'Clay',
  night: 'Night',
}

const selectClass =
  'min-h-tap w-full rounded-md border-2 border-border-strong bg-surface px-4 text-body text-ink'

interface RoomSettingsPickerProps {
  settings: RoomSettings
  onChange: (patch: Partial<RoomSettings>) => void
}

/** Language and display theme for this room. Plain selects for now; the final look comes later. */
export function RoomSettingsPicker({ settings, onChange }: RoomSettingsPickerProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={`${id}-language`} className="flex flex-col gap-1 text-body text-muted">
        Language
        <select
          id={`${id}-language`}
          value={settings.language}
          onChange={(e) => {
            if (isLanguagePreference(e.target.value)) onChange({ language: e.target.value })
          }}
          className={selectClass}
        >
          <option value="auto">Auto</option>
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code} lang={language.code}>
              {language.nativeLabel}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-theme`} className="flex flex-col gap-1 text-body text-muted">
        Display
        <select
          id={`${id}-theme`}
          value={settings.theme}
          onChange={(e) => {
            if (isTheme(e.target.value)) onChange({ theme: e.target.value })
          }}
          className={selectClass}
        >
          {THEMES.map((theme) => (
            <option key={theme} value={theme}>
              {THEME_LABELS[theme]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
