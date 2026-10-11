'use client'

import type { LanguagePreference } from '@bell/core/taxonomy'
import { fillText, type Translate } from '@bell/ui'
import { useEffect, useMemo, useState } from 'react'
import { TRANSLATIONS } from './translations'

type Table = Readonly<Record<string, string>>

/**
 * The tablet's words in the patient's language: English in, translation out (English when a
 * string has none). Spanish, Hindi and Chinese are written by hand; the rest are translated
 * live by the server on first use (a second or two, English until then).
 */
export const useScreenText = (language: LanguagePreference): Translate => {
  const [loaded, setLoaded] = useState<{ language: string; table: Table } | null>(null)

  useEffect(() => {
    if (language === 'auto' || language === 'en') return
    let live = true
    const handWritten = TRANSLATIONS[language]
    const table: Promise<Table> = handWritten
      ? handWritten().then((module) => module.default)
      : fetch(`/api/ui-text/${language}`).then((res) => res.json() as Promise<Table>)
    table
      .then((words) => {
        if (live) setLoaded({ language, table: words })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [language])

  const table = loaded?.language === language ? loaded.table : undefined
  return useMemo<Translate>(
    () => (english, vars) => fillText(table?.[english] || english, vars),
    [table],
  )
}
