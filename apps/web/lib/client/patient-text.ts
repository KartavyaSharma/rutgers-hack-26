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

/** Auto first, then the 10 voice languages by their own names. */
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { value: 'auto', label: AUTO_LANGUAGE_LABEL, sublabel: 'Any language' },
  ...LANGUAGES.map((l) => ({
    value: l.code,
    label: l.nativeLabel,
    sublabel: l.label,
    lang: l.code,
  })),
]

export const languageName = (language: LanguagePreference): string =>
  language === 'auto'
    ? AUTO_LANGUAGE_LABEL
    : (LANGUAGES.find((l) => l.code === language)?.nativeLabel ?? AUTO_LANGUAGE_LABEL)

const CONTINUE: Record<LanguagePreference, string> = {
  auto: 'Continue',
  en: 'Continue',
  es: 'Continuar',
  fr: 'Continuer',
  de: 'Weiter',
  hi: 'आगे बढ़ें',
  ru: 'Далее',
  pt: 'Continuar',
  ja: '続ける',
  it: 'Continua',
  nl: 'Doorgaan',
}

/** "Continue" in the chosen language, for the first-run screen. */
export const continueLabel = (language: LanguagePreference): string => CONTINUE[language]

/** "Choose your language" in a few of the supported languages. */
export const CHOOSE_LANGUAGE_SUBTITLE =
  'Elija su idioma · Choisissez votre langue · अपनी भाषा चुनें · 言語を選んでください'
