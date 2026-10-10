// Plain helpers for text normalization and a cheap language guess. No Effect, no network.

/**
 * Normalize free text for phrase matching: lowercase, strip Latin accents, drop apostrophes
 * (so "can't" becomes "cant"), turn other punctuation into spaces, collapse whitespace.
 * Only combining marks U+0300..U+036F are stripped, so Devanagari vowel signs survive.
 */
export const normalizeText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['`\u00b4\u2018\u2019\u02bc]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Languages we have localized patient replies for: the 10 room languages plus Chinese. */
export const SUPPORTED_LANGUAGES = [
  'en',
  'es',
  'fr',
  'de',
  'hi',
  'ru',
  'pt',
  'ja',
  'it',
  'nl',
  'zh',
] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(value)

// Small stopword lists. Words shared by several languages are fine: distinctive words decide.
const STOPWORDS: ReadonlyArray<readonly [SupportedLanguage, ReadonlySet<string>]> = [
  [
    'en',
    new Set(
      'i im ive id my me the is are was an can cant it its to of and please need want have has dont not this that in on for with you your help get could would some another there here what when how hurts feel room someone'.split(
        ' ',
      ),
    ),
  ],
  [
    'es',
    new Set(
      'el la los las del de que y en un una mi mis me por favor necesito quiero tengo estoy esta es con para puedo duele se lo su otra otro mas muy hay pero como cuando donde ayuda habitacion gracias usted yo no cuarto'.split(
        ' ',
      ),
    ),
  ],
  [
    'pt',
    new Set(
      'o os as do da dos das de que e em um uma meu minha nao por favor preciso quero tenho estou eu com para consigo dor no na voce mais muito obrigado obrigada ajuda quarto outro outra esta ta'.split(
        ' ',
      ),
    ),
  ],
  [
    'fr',
    new Set(
      'le la les de des du et en un une mon ma mes je ne pas sil vous plait jai besoin suis avec pour est au dans tres mal aide chambre merci voudrais peux'.split(
        ' ',
      ),
    ),
  ],
  [
    'de',
    new Set(
      'ich mein meine meinen der die das ist nicht und ein eine einen bitte brauche kann habe mir mich es zu mit fur noch haben sie hilfe zimmer kissen decke wasser'.split(
        ' ',
      ),
    ),
  ],
  [
    'it',
    new Set(
      'il lo la gli le di che e un una mio mia non per favore ho sono mi ancora bisogno posso vorrei aiuto camera grazie cuscino coperta'.split(
        ' ',
      ),
    ),
  ],
  [
    'nl',
    new Set(
      'ik mijn de het een is niet en van mag kan heb wil graag alstublieft nog deze kamer hulp dank kussen deken er op met'.split(
        ' ',
      ),
    ),
  ],
]

/**
 * Best-effort guess of the language of a short patient message.
 * Returns null when there is no signal (e.g. a single unknown word) or two languages tie.
 */
export const guessLanguage = (text: string): SupportedLanguage | null => {
  if (/[\u3040-\u30ff]/.test(text)) return 'ja'
  if (/[\u3400-\u9fff]/.test(text)) return 'zh'
  if (/[\u0900-\u097f]/.test(text)) return 'hi'
  if (/[\u0400-\u04ff]/.test(text)) return 'ru'
  const words = normalizeText(text).split(' ')
  let best: SupportedLanguage | null = null
  let bestScore = 0
  let tied = false
  for (const [language, stopwords] of STOPWORDS) {
    let score = 0
    for (const word of words) if (stopwords.has(word)) score++
    if (score > bestScore) {
      best = language
      bestScore = score
      tied = false
    } else if (score === bestScore && score > 0) {
      tied = true
    }
  }
  return tied ? null : best
}

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  english: 'en',
  spanish: 'es',
  espanol: 'es',
  portuguese: 'pt',
  portugues: 'pt',
  french: 'fr',
  francais: 'fr',
  chinese: 'zh',
  mandarin: 'zh',
  hindi: 'hi',
  german: 'de',
  deutsch: 'de',
  russian: 'ru',
  japanese: 'ja',
  italian: 'it',
  italiano: 'it',
  dutch: 'nl',
  nederlands: 'nl',
}

/** Clean a language code from the model ("es", "pt-BR", "Spanish") into a BCP-47-ish code. */
export const normalizeLanguageCode = (raw: string, text: string): string => {
  const value = raw.trim()
  if (/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(value)) return value.toLowerCase()
  const named = LANGUAGE_NAMES[normalizeText(value)]
  if (named !== undefined) return named
  return guessLanguage(text) ?? 'en'
}

/** Primary subtag ("pt-br" -> "pt") if we have strings for it, otherwise English. */
export const replyLanguage = (language: string): SupportedLanguage => {
  const primary = language.toLowerCase().split('-')[0] ?? 'en'
  return isSupportedLanguage(primary) ? primary : 'en'
}

/** Collapse to a single line and cap the length (by code point, so emoji are never split). */
export const oneLine = (text: string, max: number): string => {
  const flat = text
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = Array.from(flat)
  return chars.length <= max
    ? flat
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
}
