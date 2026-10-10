// Plain helpers for text normalization and a cheap language guess. No Effect, no network.
import { LANGUAGES, type LanguageCode } from './taxonomy'

/**
 * Normalize free text for phrase matching: lowercase, strip Latin accents and Arabic vowel marks,
 * drop apostrophes (so "can't" becomes "cant"), turn other punctuation into spaces, collapse
 * whitespace. Only Latin combining marks (U+0300..U+036F) and Arabic marks are stripped, so
 * Devanagari vowel signs and Korean jamo survive. "đ" and "ł" don't decompose, so they are
 * mapped to "d" and "l" by hand: "Tôi bị đau ngực" -> "toi bi dau nguc", "upadłem" -> "upadlem".
 */
export const normalizeText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0640\u064b-\u065f\u0670]/g, '')
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/\u0142/g, 'l')
    .replace(/['`\u00b4\u2018\u2019\u02bc]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Not on the language screen, but auto-detect (and the Deepgram fallback) can still land on them. */
export const EXTRA_REPLY_LANGUAGES = ['fr', 'de', 'ja', 'it', 'nl'] as const

/** Languages we have patient-facing strings for: the 12 room languages plus the extras. */
export type SupportedLanguage = LanguageCode | (typeof EXTRA_REPLY_LANGUAGES)[number]

export const SUPPORTED_LANGUAGES: ReadonlyArray<SupportedLanguage> = [
  ...LANGUAGES.map((language) => language.code),
  ...EXTRA_REPLY_LANGUAGES,
]

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(value)

// Small stopword lists over normalizeText output. Words shared by several languages are fine:
// distinctive words decide, and a tie means no guess.
const STOPWORDS: ReadonlyArray<readonly [SupportedLanguage, ReadonlySet<string>]> = (
  [
    [
      'en',
      'i im ive id my me the is are was an can cant it its to of and please need want have has dont not this that in on for with you your help get could would some another there here what when how hurts feel room someone',
    ],
    [
      'es',
      'el la los las del de que y en un una mi mis me por favor necesito quiero tengo estoy esta es con para puedo duele se lo su otra otro mas muy hay pero como cuando donde ayuda habitacion gracias usted yo no cuarto',
    ],
    [
      'pt',
      'o os as do da dos das de que e em um uma meu minha nao por favor preciso quero tenho estou eu com para consigo dor no na voce mais muito obrigado obrigada ajuda quarto outro outra esta ta',
    ],
    [
      'tl',
      'ako ang ng mga sa ko po ba hindi kailangan pwede puwede naman yung nang ito iyon akin ikaw kayo salamat paki pakiusap gusto masakit',
    ],
    [
      'ht',
      'mwen m ou li nou yo pa ak nan pou ki bezwen tanpri kapab ka genyen gen se sa mesi kounye map pral',
    ],
    [
      'pl',
      'nie jest mi mnie sie prosze potrzebuje czy jak to w z na ze moge boli chce mam jestem dziekuje bardzo',
    ],
    [
      'vi',
      'toi khong duoc giup xin cho cua mot nay can bi dau voi roi nhe ban em anh chi la va co',
    ],
    [
      'fr',
      'le la les de des du et en un une mon ma mes je ne pas sil vous plait jai besoin suis avec pour est au dans tres mal aide chambre merci voudrais peux',
    ],
    [
      'de',
      'ich mein meine meinen der die das ist nicht und ein eine einen bitte brauche kann habe mir mich es zu mit fur noch haben sie hilfe zimmer kissen decke wasser',
    ],
    [
      'it',
      'il lo la gli le di che e un una mio mia non per favore ho sono mi ancora bisogno posso vorrei aiuto camera grazie cuscino coperta',
    ],
    [
      'nl',
      'ik mijn de het een is niet en van mag kan heb wil graag alstublieft nog deze kamer hulp dank kussen deken er op met',
    ],
  ] as const
).map(([language, words]) => [language, new Set(words.split(' '))] as const)

// Letters only Vietnamese uses (horn, hook above, dot below, d with stroke). Shared accents such
// as "ê" or "ô" are left out so French and Portuguese don't look Vietnamese.
const VIETNAMESE_LETTERS = /[ơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu

/**
 * Best-effort guess of the language of a short patient message: by script first (Japanese kana,
 * Hangul, Chinese, Arabic, Devanagari, Cyrillic, Vietnamese letters), then by stopwords.
 * Returns null when there is no signal (e.g. a single unknown word) or two languages tie.
 */
export const guessLanguage = (text: string): SupportedLanguage | null => {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja'
  if (/\p{Script=Hangul}/u.test(text)) return 'ko'
  if (/\p{Script=Han}/u.test(text)) return 'zh'
  if (/\p{Script=Arabic}/u.test(text)) return 'ar'
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi'
  if (/\p{Script=Cyrillic}/u.test(text)) return 'ru'
  if (VIETNAMESE_LETTERS.test(text)) return 'vi'
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

// Other codes for our languages: ISO 639-2/3 codes, Filipino, Chinese varieties.
const CODE_ALIASES: Readonly<Record<string, SupportedLanguage>> = {
  fil: 'tl',
  tgl: 'tl',
  hat: 'ht',
  cmn: 'zh',
  yue: 'zh',
  zho: 'zh',
  chi: 'zh',
  ara: 'ar',
  kor: 'ko',
  vie: 'vi',
  pol: 'pl',
  eng: 'en',
  spa: 'es',
  por: 'pt',
  rus: 'ru',
  hin: 'hi',
  fra: 'fr',
  fre: 'fr',
  deu: 'de',
  ger: 'de',
  jpn: 'ja',
  ita: 'it',
  nld: 'nl',
  dut: 'nl',
}

/** "zh-CN" -> "zh", "pt-BR" -> "pt", "fil" -> "tl"; null when it isn't one of our languages. */
export const canonicalLanguage = (code: string): SupportedLanguage | null => {
  const primary = code.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  const resolved = CODE_ALIASES[primary] ?? primary
  return isSupportedLanguage(resolved) ? resolved : null
}

// Language names (English and native) a model might write instead of a code.
const LANGUAGE_NAMES: ReadonlyMap<string, SupportedLanguage> = new Map(
  (
    [
      ['english', 'en'],
      ['spanish', 'es'],
      ['espanol', 'es'],
      ['chinese', 'zh'],
      ['mandarin', 'zh'],
      ['cantonese', 'zh'],
      ['中文', 'zh'],
      ['tagalog', 'tl'],
      ['filipino', 'tl'],
      ['pilipino', 'tl'],
      ['haitian creole', 'ht'],
      ['haitian', 'ht'],
      ['creole', 'ht'],
      ['kreyol', 'ht'],
      ['kreyol ayisyen', 'ht'],
      ['portuguese', 'pt'],
      ['portugues', 'pt'],
      ['russian', 'ru'],
      ['русский', 'ru'],
      ['arabic', 'ar'],
      ['العربية', 'ar'],
      ['hindi', 'hi'],
      ['हिन्दी', 'hi'],
      ['korean', 'ko'],
      ['한국어', 'ko'],
      ['vietnamese', 'vi'],
      ['tieng viet', 'vi'],
      ['polish', 'pl'],
      ['polski', 'pl'],
      ['french', 'fr'],
      ['francais', 'fr'],
      ['german', 'de'],
      ['deutsch', 'de'],
      ['japanese', 'ja'],
      ['日本語', 'ja'],
      ['italian', 'it'],
      ['italiano', 'it'],
      ['dutch', 'nl'],
      ['nederlands', 'nl'],
    ] as const
  ).map(([name, code]) => [normalizeText(name), code]),
)

/**
 * Clean a language code from a model or transcriber ("es", "zh-CN", "fil", "Spanish") into a
 * BCP-47-ish code: one of ours when we know it, else the lowercased code, else a guess.
 */
export const normalizeLanguageCode = (raw: string, text: string): string => {
  const value = raw.trim()
  if (/^[a-z]{2,3}([-_][a-z0-9]{2,8})*$/i.test(value)) {
    return canonicalLanguage(value) ?? value.toLowerCase()
  }
  const named = LANGUAGE_NAMES.get(normalizeText(value))
  if (named !== undefined) return named
  return guessLanguage(text) ?? 'en'
}

/** The language to reply in: ours if we know it (region and alias codes included), else English. */
export const replyLanguage = (language: string): SupportedLanguage =>
  canonicalLanguage(language) ?? 'en'

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
