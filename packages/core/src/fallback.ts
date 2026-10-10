// Complete nurse decisions for every path that does not trust the model, and the rules for
// what the patient is told. Patient-facing text never names a team.
import { guessLanguage, normalizeText, oneLine } from './language'
import { patientMessage, quotePatientWords } from './messages'
import { RED_FLAG_LABELS, type RedFlagMatch } from './redFlags'
import { type LanguageCode, needsNurseNow, type RouteReason, type RouteResult } from './taxonomy'

/** Reasons where the model gave no usable decision. */
export type FallbackReason = Extract<
  RouteReason,
  'timeout' | 'rate_limited' | 'invalid_output' | 'error' | 'not_configured' | 'empty_input'
>

export const FALLBACK_CATEGORY = 'unrouted'

/** One-line English staff summary that quotes the patient's own words. */
export const quoteForStaff = (text: string, language: string): string => {
  const line = oneLine(text, 120)
  if (line.length === 0) return 'Patient sent an empty message'
  return `Patient request${language === 'en' ? '' : ` (${language})`}: "${line}"`
}

/**
 * What the patient is told, decided by the same rule the apps use (`needsNurseNow`):
 * - goes to the nurse right away: "I've let your nurse know."
 * - empty input: "Okay. What do you need?" (there is nothing to read back)
 * - otherwise a draft: a read-back (the model's, or the patient's own words quoted).
 */
export const withPatientReply = (
  result: Omit<RouteResult, 'patientReply'>,
  text: string,
  readBack?: string,
): RouteResult => {
  const draft = { ...result, patientReply: '' }
  if (needsNurseNow(draft)) {
    return { ...draft, patientReply: patientMessage('nurse_notified', result.language) }
  }
  if (result.reason === 'empty_input') {
    return { ...draft, patientReply: patientMessage('ask_again', result.language) }
  }
  return { ...draft, patientReply: readBack ?? quotePatientWords(text, result.language) }
}

/**
 * Nurse decision used whenever the model's answer is missing or not trusted.
 * `language` is the room's chosen language; without one, it is guessed from the text.
 */
export const nurseFallback = (
  text: string,
  reason: FallbackReason,
  language?: LanguageCode,
): RouteResult => {
  const replyIn = language ?? guessLanguage(text) ?? 'en'
  return withPatientReply(
    {
      team: 'nurse',
      category: FALLBACK_CATEGORY,
      urgency: 'soon',
      clinical: false,
      confidence: 0,
      staffSummary: quoteForStaff(text, replyIn),
      language: replyIn,
      reason,
    },
    text,
  )
}

/** Urgent nurse decision for a red-flag phrase. Never touches the model. */
export const redFlagResult = (
  text: string,
  match: RedFlagMatch,
  language?: LanguageCode,
): RouteResult => {
  const replyIn = language ?? match.language
  return withPatientReply(
    {
      team: 'nurse',
      category: match.category,
      urgency: 'urgent',
      clinical: true,
      confidence: 1,
      staffSummary: oneLine(
        `RED FLAG (${RED_FLAG_LABELS[match.category]}): ${quoteForStaff(text, replyIn)}`,
        160,
      ),
      language: replyIn,
      reason: 'red_flag',
    },
    text,
  )
}

// ---------------------------------------------------------------------------
// Guard for the model's read-back. The prompt forbids naming a team or saying anything was
// sent; if the model does it anyway, the patient's own words are quoted instead.
// False positives only cost a nicer read-back, so the lists lean wide.
// ---------------------------------------------------------------------------

// Regex sources over normalizeText output, matched on word boundaries.
const UNSAFE_WORDS = [
  // staff and team words
  'nurses?',
  'nursing',
  'care ?aides?',
  'aides?',
  'cna',
  'housekeep\\w*',
  'cleaners?',
  'cleaning (staff|team|crew|service)',
  'facilities',
  'maintenance',
  'engineering',
  'food services?',
  'dietary',
  'kitchen',
  'it (help|support|team|desk|department)',
  'tech support',
  'help ?desk',
  'technicians?',
  'staff',
  'team',
  'enfermer(o|a|os|as|ia)',
  'auxiliar(es)?',
  '(personal|servicio|equipo) de limpieza',
  'mantenimiento',
  'cocina',
  'informatica',
  'soporte tecnico',
  'infirmier(e|es|s)?',
  'aide soignante?s?',
  'service de menage',
  'agent dentretien',
  'informatique',
  'pflege\\w*',
  'pfleger(in)?',
  'krankenschwester',
  'reinigungs\\w*',
  'hausmeister',
  'haustechnik',
  'kuche',
  'enfermagem',
  '(equipe|servico) de limpeza',
  'manutencao',
  'cozinha',
  'infermier[aei]',
  'addett[oi] alle pulizie',
  'manutenzione',
  'verpleeg\\w*',
  'verpleger',
  'zorgassistent',
  'schoonmaak\\w*',
  'onderhoudsdienst',
  'keuken',
  // claims that something was sent or that someone is coming
  'sent',
  'notified',
  'informed',
  'alerted',
  'let (the|your) \\w+ know',
  'on (the|their|its|his|her) way',
  '(is|are) coming',
  'will be (there|with you|right)',
  'i(ve| have) (asked|told|called|contacted|sent|let)',
  'he (enviado|avisado|notificado|pedido|llamado)',
  'enviad[oa]',
  'avisad[oa]',
  'en camino',
  'va a venir',
  'vendra',
  'jai (envoye|transmis|prevenu|averti|appele|demande)',
  'envoyee?',
  'va venir',
  'arrive bientot',
  'gesendet',
  'informiert',
  'benachrichtigt',
  'bescheid',
  'unterwegs',
  'kommt gleich',
  'enviei',
  'avisei',
  'a caminho',
  'vai (vir|chegar)',
  'ho (inviato|avvisato|chiamato)',
  'inviat[oa]',
  'avvisat[oa]',
  'sta arrivando',
  'in arrivo',
  'verstuurd',
  'gewaarschuwd',
  'ingelicht',
  'onderweg',
  'komt eraan',
]

// Scripts matched as plain substrings.
const UNSAFE_SUBSTRINGS = [
  'медсестр',
  'санитар',
  'уборщ',
  'отправ',
  'сообщ',
  'передан',
  'подойдут',
  '看護師',
  'ナース',
  '介護',
  '清掃',
  '送信しました',
  '知らせました',
  '伝えました',
  '向かって',
  '护士',
  '护工',
  '保洁',
  '维修',
  '已发送',
  '已通知',
  'नर्स',
  'सफाई कर्मचारी',
  'भेज दिया',
  'बता दिया',
].map(normalizeText)

const UNSAFE_WORD_REGEX = new RegExp(`(?:^| )(?:${UNSAFE_WORDS.join('|')})(?= |$)`, 'u')

/** True when a model read-back is fine to show: no team names, no claim that it was sent. */
export const isSafeReadBack = (text: string): boolean => {
  const normalized = normalizeText(text)
  if (normalized.length === 0) return false
  if (UNSAFE_WORD_REGEX.test(normalized)) return false
  return !UNSAFE_SUBSTRINGS.some((fragment) => normalized.includes(fragment))
}
