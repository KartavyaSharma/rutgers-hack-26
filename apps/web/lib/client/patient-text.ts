import {
  type CallRequest,
  findOption,
  groupOfCategory,
  IMMEDIATE_BY_REASON,
  isRtlLanguage,
  LANGUAGES,
  type LanguagePreference,
  MOST_USED_LANGUAGES,
  type RequestStatus,
} from '@bell/core/taxonomy'
import {
  fillText,
  GROUP_ICON,
  type IconName,
  type LanguageOption,
  type Translate,
} from '@bell/ui'

// Patient-facing words. Never a team name: the team stays in the data for the hospital side.

/** A spoken request that went straight to the nurse (red flag, clinical, or an AI failure). */
export const wentStraightToNurse = (request: CallRequest): boolean =>
  request.team === 'nurse' &&
  (request.clinical || (request.routeReason !== null && IMMEDIATE_BY_REASON[request.routeReason]))

/** Any call for the nurse: a nurse-now result, or the voice helper's call_my_nurse (nurse_call). */
export const isNurseCall = (request: CallRequest): boolean =>
  wentStraightToNurse(request) || (request.team === 'nurse' && request.category === 'nurse_call')

const withoutFinalPeriod = (text: string) => text.replace(/[.。]\s*$/u, '')

/**
 * What the patient asked for: the read-back for spoken requests ("An extra blanket"), the
 * option, or "Help". For a nurse call the read-back is "I've let your nurse know.", so the
 * patient's own words are the label instead.
 */
export const patientLabel = (request: CallRequest, t: Translate = fillText): string => {
  if (request.source === 'nurse_button') return t('Help')
  if (request.optionId) {
    const option = findOption(request.optionId)
    return option ? t(option.label) : request.staffSummary
  }
  const words = request.text?.trim()
  const readBack = request.patientReply?.trim()
  if (isNurseCall(request) && words) return `“${words}”`
  return withoutFinalPeriod(readBack || words || t('Your request'))
}

/** The request's group icon; a mic for spoken requests without a group. */
export const requestIcon = (request: CallRequest): IconName => {
  if (request.source === 'nurse_button') return 'alert'
  const group = request.optionId
    ? (findOption(request.optionId)?.groupId ?? null)
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

export const statusLine = (status: RequestStatus, t: Translate = fillText): string =>
  t(STATUS_LINES[status])

/** "Just now", "12 min ago", "2 hours ago". */
export const timeAgo = (iso: string, now: number, t: Translate = fillText): string => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))
  if (minutes < 1) return t('Just now')
  if (minutes < 60) return t('{n} min ago', { n: minutes })
  const hours = Math.floor(minutes / 60)
  return hours === 1 ? t('1 hour ago') : t('{n} hours ago', { n: hours })
}

export const AUTO_LANGUAGE_LABEL = 'Auto (detect)'

export const languageDir = (language: LanguagePreference): 'ltr' | 'rtl' =>
  language !== 'auto' && isRtlLanguage(language) ? 'rtl' : 'ltr'

/** "Auto (detect)": the default; the spoken language is detected. First in "Most used". */
export const AUTO_OPTION: LanguageOption = {
  value: 'auto',
  // "Auto (detect)" does not fit a 76px tile beside the check mark; the header says it in full.
  name: 'Auto',
  nativeName: 'Any language',
}

const toOption = (language: (typeof LANGUAGES)[number]): LanguageOption => ({
  value: language.code,
  name: language.label,
  nativeName: language.nativeLabel,
  lang: language.code,
  dir: languageDir(language.code),
})

/** Every language from the taxonomy (the screen sorts them A to Z). */
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = LANGUAGES.map(toOption)

/** "Most used": Auto, then MOST_USED_LANGUAGES in order. */
export const MOST_USED_OPTIONS: readonly LanguageOption[] = [
  AUTO_OPTION,
  ...MOST_USED_LANGUAGES.flatMap((code) => {
    const language = LANGUAGES.find((l) => l.code === code)
    return language ? [toOption(language)] : []
  }),
]

/** The language's own name for the header button, e.g. "Español". */
export const languageName = (language: LanguagePreference): string =>
  language === 'auto'
    ? AUTO_LANGUAGE_LABEL
    : (LANGUAGES.find((l) => l.code === language)?.nativeLabel ?? AUTO_LANGUAGE_LABEL)

// From the language boards. Keyed by code so the list can change without breaking this.
const CONTINUE: Readonly<Record<string, string>> = {
  en: 'Continue',
  es: 'Continuar',
  pt: 'Continuar',
  zh: '继续',
  hi: 'आगे बढ़ें',
  ko: '계속',
  ar: 'متابعة',
  pl: 'Dalej',
  ru: 'Далее',
  vi: 'Tiếp tục',
  fr: 'Continuer',
  it: 'Continua',
  de: 'Weiter',
  tl: 'Magpatuloy',
  ht: 'Kontinye',
}

/** "Continue" in the chosen language where the board has it, else English. */
export const continueLabel = (language: LanguagePreference): string =>
  CONTINUE[language] ?? 'Continue'

const ALL_SET: Readonly<Record<string, string>> = { en: "You're all set", es: 'Listo' }

/** "You're all set · Español" (the board's confirmation after Continue). */
export const allSetTitle = (language: LanguagePreference): string =>
  `${ALL_SET[language] ?? ALL_SET.en} · ${languageName(language)}`

/** "Choose your language" in other languages (from the language board). */
export const CHOOSE_LANGUAGE_SUBTITLE =
  'Elija su idioma · 选择您的语言 · 언어를 선택하세요 · Escolha o idioma'
