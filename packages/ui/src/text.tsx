'use client'

import { createContext, useContext } from 'react'

/** English words in, the patient's language out. `{name}` slots are filled from `vars`. */
export type Translate = (english: string, vars?: Record<string, string | number>) => string

export const fillText = (text: string, vars?: Record<string, string | number>): string =>
  vars ? text.replace(/\{(\w+)\}/g, (slot, key) => (key in vars ? String(vars[key]) : slot)) : text

const TextContext = createContext<Translate>(fillText)

/** The tablet's screen language. Without a provider every string stays English. */
export const TextProvider = TextContext.Provider

/** Wrap every patient-facing English string in `t(...)` and add it to apps/web/lib/patient/translations. */
export const useT = (): Translate => useContext(TextContext)
