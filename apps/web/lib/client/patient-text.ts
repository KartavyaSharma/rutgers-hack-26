import {
  type CallRequest,
  groupOfCategory,
  IMMEDIATE_BY_REASON,
  LANGUAGES,
  type LanguagePreference,
  optionById,
  type RequestStatus,
} from '@bell/core/taxonomy'
import { GROUP_ICON, type IconName, type LanguageOption } from '@bell/ui'

// Patient-facing words. Never a team name: the team stays in the data for the hospital side.

/** A spoken request that went straight to the nurse (red flag, clinical, or an AI failure). */
export const wentStraightToNurse = (request: CallRequest): boolean =>
  request.team === 'nurse' &&
  (request.clinical || (request.routeReason !== null && IMMEDIATE_BY_REASON[request.routeReason]))

const withoutFinalPeriod = (text: string) => text.replace(/[.。]\s*$/u, '')

/**
 * What the patient asked for: the read-back for spoken requests ("An extra blanket"), the
 * option, or "Help". When it went straight to the nurse the read-back is "I've let your nurse
 * know.", so the patient's own words are the label instead.
 */
export const patientLabel = (request: CallRequest): string => {
  if (request.source === 'nurse_button') return 'Help'
  if (request.optionId) return optionById(request.optionId).label
  const words = request.text?.trim()
  const readBack = request.patientReply?.trim()
  if (wentStraightToNurse(request) && words) return `“${words}”`
  return withoutFinalPeriod(readBack || words || 'Your request')
}

/** The request's group icon; a mic for spoken requests without a group. */
export const requestIcon = (request: CallRequest): IconName => {
  if (request.source === 'nurse_button') return 'alert'
  const group = request.optionId
    ? optionById(request.optionId).groupId
    : groupOfCategory(request.category)
  return group ? GROUP_ICON[group] : 'mic'
}

const STATUS_LINES: Record<RequestStatus, string> = {
  sent: 'Sent',
  seen: 'Seen by your care team',
  on_the_way: 'Someone is on the way',
  done: 'Done',
  cancelled: 'Cancelled',
}

export const statusLine = (status: RequestStatus): string => STATUS_LINES[status]

/** "Just now", "12 min ago", "2 hours ago". */
export const timeAgo = (iso: string, now: number): string => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}

export const AUTO_LANGUAGE_LABEL = 'Auto (detect)'

/** Languages written right to left. */
const RTL_LANGUAGES: ReadonlySet<LanguagePreference> = new Set(['ar'])

export const languageDir = (language: LanguagePreference): 'ltr' | 'rtl' =>
  RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr'

/** "Auto (detect)": the default, the language is detected from speech. */
export const AUTO_OPTION: LanguageOption = {
  value: 'auto',
  label: AUTO_LANGUAGE_LABEL,
  sublabel: 'Any language',
}

/** The 12 languages in the board's order, by their own names. */
export const LANGUAGE_GRID_OPTIONS: readonly LanguageOption[] = LANGUAGES.map((l) => ({
  value: l.code,
  label: l.nativeLabel,
  sublabel: l.label,
  lang: l.code,
  dir: languageDir(l.code),
}))

/** Auto first, then the 12 languages (the Language sheet). */
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [AUTO_OPTION, ...LANGUAGE_GRID_OPTIONS]

export const languageName = (language: LanguagePreference): string =>
  language === 'auto'
    ? AUTO_LANGUAGE_LABEL
    : (LANGUAGES.find((l) => l.code === language)?.nativeLabel ?? AUTO_LANGUAGE_LABEL)

// From the LangStart board.
const CONTINUE: Record<LanguagePreference, string> = {
  auto: 'Continue',
  en: 'Continue',
  es: 'Continuar',
  zh: '继续',
  tl: 'Magpatuloy',
  ht: 'Kontinye',
  pt: 'Continuar',
  ru: 'Далее',
  ar: 'متابعة',
  hi: 'आगे बढ़ें',
  ko: '계속',
  vi: 'Tiếp tục',
  pl: 'Dalej',
}

/** "Continue" in the chosen language, for the first-run screen. */
export const continueLabel = (language: LanguagePreference): string => CONTINUE[language]

/** "Choose your language" in other languages (from the LangStart board). */
export const CHOOSE_LANGUAGE_SUBTITLE =
  'Elija su idioma · 选择您的语言 · Pumili ng wika · Chwazi lang ou'
