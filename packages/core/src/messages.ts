// Patient-facing strings and the yes/no check for confirming a draft.
// Effect-free: client components import this via `@bell/core/messages`.
// Patient-facing text never names a team.
import { normalizeText, oneLine, replyLanguage, type SupportedLanguage } from './language'
import type { LanguagePreference, RouteResult } from './taxonomy'

export const PATIENT_MESSAGE_KEYS = [
  'confirm_prompt',
  'sent',
  'nurse_notified',
  'ask_again',
  'not_sent',
  'save_failed',
] as const
export type PatientMessageKey = (typeof PATIENT_MESSAGE_KEYS)[number]

const MESSAGES: Record<PatientMessageKey, Record<SupportedLanguage, string>> = {
  confirm_prompt: {
    en: 'Say yes, or tap Send.',
    es: 'Diga sí, o toque Enviar.',
    fr: 'Dites oui, ou touchez Envoyer.',
    de: 'Sagen Sie Ja, oder tippen Sie auf Senden.',
    hi: 'हाँ कहें, या भेजें पर टैप करें।',
    ru: 'Скажите «да» или нажмите «Отправить».',
    pt: 'Diga sim, ou toque em Enviar.',
    ja: '「はい」と言うか、「送信」をタップしてください。',
    it: 'Dica sì, oppure tocchi Invia.',
    nl: 'Zeg ja, of tik op Versturen.',
    zh: '请说“是”，或点击“发送”。',
  },
  sent: {
    en: 'Sent. Someone will be with you soon.',
    es: 'Enviado. Alguien vendrá pronto.',
    fr: "Envoyé. Quelqu'un va venir bientôt.",
    de: 'Gesendet. Gleich kommt jemand zu Ihnen.',
    hi: 'भेज दिया गया। कोई जल्द ही आपके पास आएगा।',
    ru: 'Отправлено. Скоро к вам подойдут.',
    pt: 'Enviado. Alguém virá em breve.',
    ja: '送信しました。まもなく担当者が伺います。',
    it: 'Inviato. Qualcuno arriverà presto.',
    nl: 'Verstuurd. Er komt zo iemand bij u.',
    zh: '已发送。很快会有人来帮您。',
  },
  nurse_notified: {
    en: "I've let your nurse know.",
    es: 'Le he avisado a su enfermera.',
    fr: "J'ai prévenu votre infirmière.",
    de: 'Ich habe Ihrer Pflegekraft Bescheid gegeben.',
    hi: 'मैंने आपकी नर्स को बता दिया है।',
    ru: 'Ваша медсестра предупреждена.',
    pt: 'Avisei a sua enfermeira.',
    ja: '看護師に知らせました。',
    it: "Ho avvisato l'infermiere.",
    nl: 'Ik heb uw verpleegkundige ingelicht.',
    zh: '我已通知您的护士。',
  },
  ask_again: {
    en: 'Okay. What do you need?',
    es: 'De acuerdo. ¿Qué necesita?',
    fr: "D'accord. De quoi avez-vous besoin ?",
    de: 'Okay. Was brauchen Sie?',
    hi: 'ठीक है। आपको क्या चाहिए?',
    ru: 'Хорошо. Что вам нужно?',
    pt: 'Certo. Do que você precisa?',
    ja: 'わかりました。何が必要ですか？',
    it: 'Va bene. Di cosa ha bisogno?',
    nl: 'Oké. Wat heeft u nodig?',
    zh: '好的。您需要什么？',
  },
  not_sent: {
    en: 'Not sent yet',
    es: 'Aún no enviado',
    fr: 'Pas encore envoyé',
    de: 'Noch nicht gesendet',
    hi: 'अभी भेजा नहीं गया',
    ru: 'Ещё не отправлено',
    pt: 'Ainda não enviado',
    ja: 'まだ送信されていません',
    it: 'Non ancora inviato',
    nl: 'Nog niet verstuurd',
    zh: '尚未发送',
  },
  save_failed: {
    en: "Sorry, I couldn't send that. Please press the My nurse button.",
    es: 'Lo siento, no pude enviarlo. Por favor, pulse el botón Mi enfermera.',
    fr: "Désolé, je n'ai pas pu l'envoyer. Appuyez sur le bouton Mon infirmière.",
    de: 'Entschuldigung, das konnte ich nicht senden. Bitte drücken Sie die Taste Meine Pflegekraft.',
    hi: 'माफ़ कीजिए, यह भेजा नहीं जा सका। कृपया मेरी नर्स बटन दबाएँ।',
    ru: 'Извините, не удалось отправить. Пожалуйста, нажмите кнопку «Моя медсестра».',
    pt: 'Desculpe, não consegui enviar. Por favor, aperte o botão Minha enfermeira.',
    ja: '申し訳ありません、送信できませんでした。「ナースコール」ボタンを押してください。',
    it: 'Mi dispiace, non sono riuscito a inviarlo. Prema il pulsante Il mio infermiere.',
    nl: 'Sorry, dat kon ik niet versturen. Druk op de knop Mijn verpleegkundige.',
    zh: '抱歉，无法发送。请按“我的护士”按钮。',
  },
}

/** A patient-facing message in the given language. "auto" or an unknown code gives English. */
export const patientMessage = (
  key: PatientMessageKey,
  language: LanguagePreference | string,
): string => MESSAGES[key][replyLanguage(language)]

const QUOTES: Partial<Record<SupportedLanguage, readonly [string, string]>> = {
  fr: ['« ', ' »'],
  de: ['„', '“'],
  ru: ['«', '»'],
  ja: ['「', '」'],
}

/** The patient's own words as a one-line quote, e.g. “my thing is weird”. */
export const quotePatientWords = (text: string, language: LanguagePreference | string): string => {
  const [open, close] = QUOTES[replyLanguage(language)] ?? ['“', '”']
  return `${open}${oneLine(text, 120)}${close}`
}

const NO_SPACE_LANGUAGES: ReadonlySet<SupportedLanguage> = new Set(['ja', 'zh'])

/** What to show or say for a pending draft: the read-back, then how to confirm it. */
export const draftReadBack = (result: Pick<RouteResult, 'patientReply' | 'language'>): string => {
  const prompt = patientMessage('confirm_prompt', result.language)
  const readBack = result.patientReply.trim()
  if (readBack.length === 0) return prompt
  return NO_SPACE_LANGUAGES.has(replyLanguage(result.language))
    ? `${readBack}${prompt}`
    : `${readBack} ${prompt}`
}

// ---------------------------------------------------------------------------
// Confirmation: is the patient's answer to a read-back a plain yes, a plain no, or a new
// request? Deterministic. Only an utterance made entirely of affirmations (plus filler such
// as "please" or "thanks") is "yes"; anything with more content is "other" and gets routed again.
// ---------------------------------------------------------------------------

export type Confirmation = 'yes' | 'no' | 'other'

// All languages are always accepted: patients often answer in a language other than the setting.
const YES = [
  // en
  'yes',
  'yeah',
  'yea',
  'yep',
  'yup',
  'ya',
  'yah',
  'sure',
  'ok',
  'okay',
  'k',
  'correct',
  'right',
  "that's right",
  'that is right',
  "that's correct",
  'that is correct',
  "that's it",
  'exactly',
  'absolutely',
  'definitely',
  'of course',
  'please do',
  'do it',
  'go ahead',
  'send',
  'send it',
  'send that',
  'confirm',
  'confirmed',
  'affirmative',
  'uh huh',
  'mhm',
  'mm hmm',
  'sounds good',
  'perfect',
  'it is',
  'alright',
  'all right',
  'fine',
  // es
  'sí',
  'claro',
  'claro que sí',
  'por supuesto',
  'correcto',
  'exacto',
  'exactamente',
  'eso es',
  'así es',
  'vale',
  'de acuerdo',
  'dale',
  'envíalo',
  'envíelo',
  'enviar',
  'envía',
  'mándalo',
  'perfecto',
  'está bien',
  // fr
  'oui',
  'ouais',
  "d'accord",
  'exactement',
  "c'est ça",
  "c'est correct",
  "c'est bon",
  'bien sûr',
  'envoyer',
  'envoie',
  'envoyez',
  'envoie le',
  'envoyez le',
  'parfait',
  'tout à fait',
  'volontiers',
  // de
  'ja',
  'jawohl',
  'jo',
  'genau',
  'richtig',
  'stimmt',
  'klar',
  'natürlich',
  'senden',
  'absenden',
  'schicken',
  'schick es',
  'passt',
  'korrekt',
  'gerne',
  // it
  'sì',
  'certo',
  'esatto',
  'giusto',
  'va bene',
  "d'accordo",
  'invia',
  'invialo',
  'sicuro',
  'certamente',
  'perfetto',
  'corretto',
  // pt
  'sim',
  'isso',
  'isso mesmo',
  'exato',
  'pode mandar',
  'pode enviar',
  'manda',
  'mande',
  'envia',
  'com certeza',
  'tá bom',
  'beleza',
  'está certo',
  'correto',
  'perfeito',
  // nl
  'jazeker',
  'jawel',
  'klopt',
  'dat klopt',
  'prima',
  'goed',
  'verstuur',
  'versturen',
  'zeker',
  'precies',
  'oké',
  'akkoord',
  // ru
  'да',
  'ага',
  'конечно',
  'верно',
  'правильно',
  'отправь',
  'отправьте',
  'отправляй',
  'хорошо',
  'ладно',
  'точно',
  'именно',
  // ja
  'はい',
  'ええ',
  'うん',
  'そうです',
  'そう',
  'お願いします',
  '送信',
  '送って',
  '送ってください',
  '正しい',
  'その通り',
  // hi
  'हाँ',
  'हां',
  'जी',
  'जी हाँ',
  'जी हां',
  'ठीक है',
  'सही है',
  'बिल्कुल',
  'भेज दो',
  'भेजो',
  'भेज दीजिए',
  // zh
  '是',
  '是的',
  '对',
  '对的',
  '好',
  '好的',
  '可以',
  '发送',
  '没错',
  '嗯',
  '行',
]

const NO = [
  // en
  'no',
  'nope',
  'nah',
  'not now',
  'cancel',
  "don't",
  "don't send",
  "don't send it",
  'do not send',
  'never mind',
  'nevermind',
  'wrong',
  "that's wrong",
  "that's not right",
  'not right',
  'incorrect',
  'negative',
  'no way',
  'stop',
  // es
  'cancelar',
  'cancela',
  'no lo envíes',
  'no envíes',
  'para nada',
  'incorrecto',
  'está mal',
  // fr
  'non',
  'nan',
  'annuler',
  'annule',
  'pas maintenant',
  "n'envoie pas",
  "n'envoyez pas",
  "c'est faux",
  'faux',
  'pas du tout',
  // de
  'nein',
  'nee',
  'ne',
  'nö',
  'abbrechen',
  'falsch',
  'nicht senden',
  'nicht schicken',
  'auf keinen fall',
  // it
  'annulla',
  'sbagliato',
  'non inviare',
  'per niente',
  // pt
  'não',
  'errado',
  'não envie',
  'de jeito nenhum',
  // nl
  'neen',
  'nee hoor',
  'annuleren',
  'fout',
  'niet versturen',
  'niet doen',
  // ru
  'нет',
  'не надо',
  'не нужно',
  'отмена',
  'отменить',
  'неверно',
  'неправильно',
  'не отправляй',
  // ja
  'いいえ',
  'いや',
  'いえ',
  '違います',
  '違う',
  'ちがう',
  'キャンセル',
  '結構です',
  '送らないで',
  // hi
  'नहीं',
  'नही',
  'जी नहीं',
  'ना',
  'मत भेजो',
  'रद्द करो',
  'गलत',
  // zh
  '不',
  '不是',
  '不要',
  '不用',
  '取消',
  '不对',
  '没有',
]

// Words that don't change the meaning of a yes or a no.
const FILLER = [
  'um',
  'umm',
  'uh',
  'uhm',
  'er',
  'erm',
  'hmm',
  'hm',
  'oh',
  'ah',
  'well',
  'so',
  'just',
  'now',
  'please',
  'pls',
  'plz',
  'thanks',
  'thank you',
  'thx',
  'ty',
  'por favor',
  'gracias',
  'muchas gracias',
  'pues',
  "s'il vous plaît",
  "s'il te plaît",
  'merci',
  'merci beaucoup',
  'bitte',
  'danke',
  'danke schön',
  'grazie',
  'per favore',
  'obrigado',
  'obrigada',
  'dank je',
  'dank u',
  'dank je wel',
  'alstublieft',
  'graag',
  'пожалуйста',
  'спасибо',
  'ありがとう',
  'ありがとうございます',
  'どうも',
  'धन्यवाद',
  'कृपया',
  'शुक्रिया',
  '谢谢',
  '请',
]

interface Unit {
  readonly tokens: ReadonlyArray<string>
  readonly chars: ReadonlyArray<string>
  readonly counts: boolean
}

const toUnits = (phrases: ReadonlyArray<string>, counts: boolean): ReadonlyArray<Unit> =>
  phrases.map((phrase) => {
    const normalized = normalizeText(phrase)
    return {
      tokens: normalized.split(' '),
      chars: Array.from(normalized.replace(/ /g, '')),
      counts,
    }
  })

const FILLER_UNITS = toUnits(FILLER, false)
const YES_UNITS = [...toUnits(YES, true), ...FILLER_UNITS]
const NO_UNITS = [...toUnits(NO, true), ...FILLER_UNITS]

/**
 * Can `items` be split entirely into units, using at least one unit that counts?
 * Dynamic programming over positions: 0 = unreachable, 1 = reachable with filler only,
 * 2 = reachable with at least one real yes/no phrase.
 */
const segments = (
  items: ReadonlyArray<string>,
  units: ReadonlyArray<Unit>,
  pick: (unit: Unit) => ReadonlyArray<string>,
): boolean => {
  const reach = new Array<number>(items.length + 1).fill(0)
  reach[0] = 1
  for (let i = 0; i < items.length; i++) {
    const from = reach[i] ?? 0
    if (from === 0) continue
    for (const unit of units) {
      const parts = pick(unit)
      if (parts.length === 0 || i + parts.length > items.length) continue
      if (parts.every((part, k) => items[i + k] === part)) {
        const to = unit.counts ? 2 : from
        const j = i + parts.length
        if ((reach[j] ?? 0) < to) reach[j] = to
      }
    }
  }
  return reach[items.length] === 2
}

const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

/**
 * Classify a reply to a read-back. "yes" / "no" only for a bare affirmation / negation
 * (filler like "please" or "thanks" allowed); anything else, like "no, I wanted a blanket"
 * or "yes and my chest hurts", is "other" and should be routed as a new request.
 *
 * `language` is accepted for symmetry with the rest of the API; every language is always
 * recognised, because patients often answer in a language other than the room setting.
 */
export const classifyConfirmation = (
  text: string,
  _language?: LanguagePreference | string,
): Confirmation => {
  const normalized = normalizeText(typeof text === 'string' ? text : '')
  if (normalized.length === 0) return 'other'
  const unspaced = UNSPACED_SCRIPT.test(normalized)
  const items = unspaced ? Array.from(normalized.replace(/ /g, '')) : normalized.split(' ')
  const pick = unspaced ? (unit: Unit) => unit.chars : (unit: Unit) => unit.tokens
  const yes = segments(items, YES_UNITS, pick)
  const no = segments(items, NO_UNITS, pick)
  if (yes && !no) return 'yes'
  if (no && !yes) return 'no'
  return 'other'
}
