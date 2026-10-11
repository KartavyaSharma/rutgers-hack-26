import { CHART_OPTIONS, REQUEST_GROUPS } from '@bell/core/taxonomy'
import { fillText, GROUP_ICON, type IconName, type StepStatus, type Translate } from '@bell/ui'
import zh from '../../../web/lib/patient/translations/zh.json'

// Dummy data for the demo: one patient, her chart, and the requests she makes on camera. She is bilingual: English, then Chinese.

export const PATIENT = { firstName: 'Mei', room: '412', bed: '3' }

/** 'auto' is the tablet's default: English on screen until Bell hears another language. */
export type DemoLanguage = 'auto' | 'zh'

export const LANGUAGE_NAMES: Record<DemoLanguage, string> = {
  auto: 'Auto (detect)',
  zh: '简体中文',
}

/** The tablet's own hand-written Chinese table, with English for anything missing. */
const CHINESE: Readonly<Record<string, string>> = zh

export const translator = (language: DemoLanguage): Translate =>
  language === 'auto' ? fillText : (english, vars) => fillText(CHINESE[english] ?? english, vars)

export interface DemoRequest {
  id: string
  /** English; translated on screen. */
  label: string
  icon: IconName
  status: StepStatus
}

export const WATER = { id: 'water', label: 'Water', icon: 'water' } as const
export const BLANKET = { id: 'blanket', label: 'Blanket', icon: 'comfort' } as const
export const PILLOW = { id: 'pillow', label: 'Pillow', icon: 'comfort' } as const

// The eight category buttons, built the way apps/web/lib/patient/catalog.ts builds them.
export const CATEGORIES = REQUEST_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  examples: group.hint,
  icon: GROUP_ICON[group.id],
}))

/** Ade, who is fasting for his MRI (as in the staff demo seed). */
export const ADE = { firstName: 'Ade', room: '420', bed: '' }

/** The food screen while fasting: eating and drinking are gone, three safe options are left. */
export const FASTING_SCREEN = {
  label: 'Food and drink',
  notice: {
    title: 'Nothing to eat or drink until after your MRI',
    body: 'Your brain MRI is at 3:45 PM and your stomach needs to be empty for it. You can eat and drink right after.',
  },
  options: CHART_OPTIONS.map((o) => ({ id: o.id, label: o.label, sub: o.sub })),
}
