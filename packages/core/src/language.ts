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

/** Every board language has patient-facing strings (see messages.ts). */
export type SupportedLanguage = LanguageCode

export const SUPPORTED_LANGUAGES: ReadonlyArray<SupportedLanguage> = LANGUAGES.map(
  (language) => language.code,
)

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(value)

type Stopwords = ReadonlyArray<readonly [SupportedLanguage, ReadonlySet<string>]>

const stopwords = (table: ReadonlyArray<readonly [SupportedLanguage, string]>): Stopwords =>
  table.map(([language, words]) => [language, new Set(normalizeText(words).split(' '))] as const)

// Latin-script languages, over normalizeText output. Words shared by several languages are fine:
// distinctive words decide, and a tie means no guess.
const LATIN_STOPWORDS = stopwords([
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
    'pl',
    'nie jest mi mnie sie prosze potrzebuje czy jak to w z na ze moge boli chce mam jestem dziekuje bardzo',
  ],
  ['vi', 'toi khong duoc giup xin cho cua mot nay can bi dau voi roi nhe ban em anh chi la va co'],
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
])

// Devanagari: Hindi unless Marathi or Nepali words win.
const DEVANAGARI_STOPWORDS = stopwords([
  ['hi', 'है हैं मुझे में नहीं क्या चाहिए और का की के को से यह मैं आप'],
  ['mr', 'आहे आहेत मला मी नाही हवं हवे आणि काय तुम्ही आम्ही होतं करा'],
  ['ne', 'छ छु छैन मलाई म गर्न भयो हुन्छ तपाईं चाहियो पनि गर्नुहोस्'],
])

// Cyrillic without a distinctive letter: Russian unless Bulgarian words win.
const CYRILLIC_STOPWORDS = stopwords([
  ['ru', 'и в не на я мне нужно пожалуйста у меня это что как вы'],
  ['bg', 'и на се да не съм ми моля искам трябва имам това е ли'],
])

/** The language with the most stopword hits, or null on no hits or a tie. */
const byStopwords = (text: string, table: Stopwords): SupportedLanguage | null => {
  const words = normalizeText(text).split(' ')
  let best: SupportedLanguage | null = null
  let bestScore = 0
  let tied = false
  for (const [language, set] of table) {
    let score = 0
    for (const word of words) if (set.has(word)) score++
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

// Letters only Vietnamese uses (horn, hook above, dot below, d with stroke). Shared accents such
// as "ê" or "ô" are left out so French and Portuguese don't look Vietnamese.
const VIETNAMESE_LETTERS = /[ơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu

// Scripts used by one board language.
const SINGLE_LANGUAGE_SCRIPTS: ReadonlyArray<readonly [RegExp, SupportedLanguage]> = [
  [/\p{Script=Hangul}/u, 'ko'],
  [/\p{Script=Hebrew}/u, 'he'],
  [/\p{Script=Gurmukhi}/u, 'pa'],
  [/\p{Script=Gujarati}/u, 'gu'],
  [/\p{Script=Oriya}/u, 'or'],
  [/\p{Script=Tamil}/u, 'ta'],
  [/\p{Script=Telugu}/u, 'te'],
  [/\p{Script=Kannada}/u, 'kn'],
  [/\p{Script=Malayalam}/u, 'ml'],
  [/\p{Script=Thai}/u, 'th'],
  [/\p{Script=Armenian}/u, 'hy'],
  [/\p{Script=Greek}/u, 'el'],
  [/\p{Script=Georgian}/u, 'ka'],
  [/\p{Script=Myanmar}/u, 'my'],
]

// Shared scripts, told apart by letters or characters only one language uses.
const CANTONESE_CHARACTERS = /[嘅咗唔喺嚟啲冇嘢佢哋係咩乜揾搵睇畀噉嗰]/u
const SINDHI_LETTERS = /[ٻڀٺٽٿڄڃڇڊڌڍڏڙڦڪڱڳڻ]/u
const PASHTO_LETTERS = /[ټډړږښګڼۍې]/u
const URDU_LETTERS = /[ٹڈڑںےۓھ]/u
const PERSIAN_LETTERS = /[پچژگکی]/u
const ASSAMESE_LETTERS = /[ৰৱ]/u
const TAJIK_LETTERS = /[ӣӯҳҷ]/iu
const KAZAKH_LETTERS = /[әұһғқ]/iu
const KYRGYZ_LETTERS = /[ң]/iu
const MONGOLIAN_LETTERS = /[өү]/iu
const BELARUSIAN_LETTERS = /[ў]/iu
const SERBIAN_LETTERS = /[ђћ]/iu
const MACEDONIAN_LETTERS = /[ѓќѕ]/iu
// Shared by Serbian and Macedonian: Serbian, the more widely used, wins.
const SOUTH_SLAVIC_LETTERS = /[јљњџ]/iu
const UKRAINIAN_LETTERS = /[іїєґ]/iu
const RUSSIAN_LETTERS = /[ыэё]/iu

/**
 * Best-effort guess of the language of a short patient message: by script first, then by
 * distinctive letters within a shared script, then by stopwords. When a shared script can't be
 * told apart, the most-used language wins (Chinese, Arabic, Hindi, Bengali, Russian, Serbian).
 * Returns null when there is no signal (e.g. a single unknown Latin-script word) or a tie.
 */
export const guessLanguage = (text: string): SupportedLanguage | null => {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja'
  for (const [script, language] of SINGLE_LANGUAGE_SCRIPTS) if (script.test(text)) return language
  if (/\p{Script=Han}/u.test(text)) return CANTONESE_CHARACTERS.test(text) ? 'yue' : 'zh'
  if (/\p{Script=Arabic}/u.test(text)) {
    if (SINDHI_LETTERS.test(text)) return 'sd'
    if (PASHTO_LETTERS.test(text)) return 'ps'
    if (URDU_LETTERS.test(text)) return 'ur'
    return PERSIAN_LETTERS.test(text) ? 'fa' : 'ar'
  }
  if (/\p{Script=Devanagari}/u.test(text)) return byStopwords(text, DEVANAGARI_STOPWORDS) ?? 'hi'
  if (/\p{Script=Bengali}/u.test(text)) return ASSAMESE_LETTERS.test(text) ? 'as' : 'bn'
  if (/\p{Script=Cyrillic}/u.test(text)) {
    if (TAJIK_LETTERS.test(text)) return 'tg'
    if (KAZAKH_LETTERS.test(text)) return 'kk'
    if (KYRGYZ_LETTERS.test(text)) return 'ky'
    if (MONGOLIAN_LETTERS.test(text)) return 'mn'
    if (BELARUSIAN_LETTERS.test(text)) return 'be'
    if (SERBIAN_LETTERS.test(text)) return 'sr'
    if (MACEDONIAN_LETTERS.test(text)) return 'mk'
    if (SOUTH_SLAVIC_LETTERS.test(text)) return 'sr'
    if (UKRAINIAN_LETTERS.test(text)) return 'uk'
    if (RUSSIAN_LETTERS.test(text)) return 'ru'
    return byStopwords(text, CYRILLIC_STOPWORDS) ?? 'ru'
  }
  if (VIETNAMESE_LETTERS.test(text)) return 'vi'
  return byStopwords(text, LATIN_STOPWORDS)
}

// Other codes for our languages: legacy and ISO 639-2/3 codes (ElevenLabs Scribe returns codes like
// "hrv", "cym", "zho") and macrolanguage members.
const CODE_ALIASES: Readonly<Record<string, SupportedLanguage>> = {
  fil: 'tl',
  tgl: 'tl',
  cmn: 'zh',
  zho: 'zh',
  chi: 'zh',
  nb: 'no',
  nn: 'no',
  nob: 'no',
  nno: 'no',
  nor: 'no',
  iw: 'he',
  heb: 'he',
  in: 'id',
  ind: 'id',
  mo: 'ro',
  ron: 'ro',
  rum: 'ro',
  bos: 'bs',
  hrv: 'hr',
  sh: 'hr',
  srp: 'sr',
  cnr: 'sr',
  bel: 'be',
  mya: 'my',
  bur: 'my',
  nya: 'ny',
  kat: 'ka',
  geo: 'ka',
  hau: 'ha',
  gle: 'ga',
  jav: 'jv',
  jw: 'jv',
  kir: 'ky',
  lin: 'ln',
  ltz: 'lb',
  mlt: 'mt',
  mri: 'mi',
  mao: 'mi',
  mon: 'mn',
  khk: 'mn',
  oci: 'oc',
  pus: 'ps',
  pbu: 'ps',
  pbt: 'ps',
  pst: 'ps',
  snd: 'sd',
  som: 'so',
  tgk: 'tg',
  uzb: 'uz',
  uzn: 'uz',
  cym: 'cy',
  wel: 'cy',
  yor: 'yo',
  zsm: 'ms',
  msa: 'ms',
  may: 'ms',
  pan: 'pa',
  guj: 'gu',
  ben: 'bn',
  asm: 'as',
  tam: 'ta',
  tel: 'te',
  kan: 'kn',
  mal: 'ml',
  mar: 'mr',
  nep: 'ne',
  ori: 'or',
  ory: 'or',
  urd: 'ur',
  fas: 'fa',
  per: 'fa',
  prs: 'fa',
  ell: 'el',
  gre: 'el',
  tha: 'th',
  tur: 'tr',
  ukr: 'uk',
  hye: 'hy',
  arm: 'hy',
  kaz: 'kk',
  swa: 'sw',
  swh: 'sw',
  swe: 'sv',
  dan: 'da',
  fin: 'fi',
  est: 'et',
  lav: 'lv',
  lit: 'lt',
  mkd: 'mk',
  mac: 'mk',
  isl: 'is',
  ice: 'is',
  hun: 'hu',
  ces: 'cs',
  cze: 'cs',
  slk: 'sk',
  slo: 'sk',
  slv: 'sl',
  bul: 'bg',
  cat: 'ca',
  glg: 'gl',
  afr: 'af',
  aze: 'az',
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

/**
 * "zh-CN" -> "zh", "zh-HK" -> "yue", "pt-BR" -> "pt", "fil" -> "tl", "nb" -> "no", "iw" -> "he",
 * "hrv" -> "hr", "cym" -> "cy";
 * null when it isn't one of our languages.
 */
export const canonicalLanguage = (code: string): SupportedLanguage | null => {
  const parts = code.trim().toLowerCase().split(/[-_]/)
  const primary = parts[0] ?? ''
  // Chinese as used in Hong Kong and Macau is spoken Cantonese.
  if (primary === 'zh' && parts.some((part) => part === 'hk' || part === 'mo')) return 'yue'
  const resolved = CODE_ALIASES[primary] ?? primary
  return isSupportedLanguage(resolved) ? resolved : null
}

// Language names a model or transcriber might write instead of a code: every board label and
// native label, plus a few common alternatives.
const LANGUAGE_NAMES: ReadonlyMap<string, SupportedLanguage> = new Map([
  ...LANGUAGES.flatMap((language) => [
    [normalizeText(language.label), language.code] as const,
    [normalizeText(language.nativeLabel), language.code] as const,
  ]),
  ...(
    [
      ['tagalog', 'tl'],
      ['pilipino', 'tl'],
      ['mandarin', 'zh'],
      ['中文', 'zh'],
      ['繁體中文', 'zh'],
      ['castilian', 'es'],
      ['castellano', 'es'],
      ['farsi', 'fa'],
      ['bokmal', 'no'],
      ['nynorsk', 'no'],
      ['oriya', 'or'],
      ['srpski', 'sr'],
      ['nyanja', 'ny'],
      ['irish gaelic', 'ga'],
      ['dari', 'fa'],
      ['moldovan', 'ro'],
    ] as const
  ).map(([name, code]) => [normalizeText(name), code] as const),
])

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
