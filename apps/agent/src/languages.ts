// Language codes per provider. Each set was checked with real calls; a code outside it (e.g.
// after the language list changes) is left out and the provider auto-detects or follows the text.
// MAI's hints live with the MAI backup (stt-mai.ts).
import { isLanguageCode, type LanguageCode } from '@bell/core/taxonomy'

/** Room-language codes ElevenLabs takes under another name ("tl" is a 400; checked). */
const ELEVEN_ALIASES: Readonly<Record<string, string>> = { tl: 'fil' }

/**
 * language_code values eleven_v4_turbo accepted, each checked with a real call (the model's 85
 * languages in /v1/models, all board languages). A room language outside this set gets no code,
 * and ElevenLabs follows the text.
 */
const ELEVEN_V4_LANGUAGES: ReadonlySet<string> = new Set(
  (
    'en es zh pt hi gu ko ar pl af hy as az bn bs bg yue ca cs da nl et fi fr gl de el he hu ' +
    'is id it ja kn kk lv lt mk ms ml mr ne no or fa pa ro ru sk sl sw sv ta te th tr uk ur vi fil ' +
    'ast be my ceb ny hr ka ha ga jv ky ln lb mt mi mn oc ps sr sd so tg uz cy yo'
  ).split(' '),
)

/** The ElevenLabs language code for a room language, or undefined to follow the text. */
export function elevenLabsLanguage(language: string): string | undefined {
  if (language === 'auto') return undefined
  const code = ELEVEN_ALIASES[language] ?? language
  return ELEVEN_V4_LANGUAGES.has(code) ? code : undefined
}

/**
 * Providers' other codes for board languages: ISO 639-3 and 639-2/B codes, and legacy or
 * macrolanguage-member codes (MAI "fil"/"nb"/"iw", Scribe "fil"/"ceb", maybe "nya", "lin").
 */
const BOARD_ALIASES: Readonly<Record<string, string>> = {
  fil: 'tl',
  tgl: 'tl',
  nb: 'no',
  nn: 'no',
  nob: 'no',
  nno: 'no',
  nor: 'no',
  iw: 'he',
  heb: 'he',
  in: 'id',
  ind: 'id',
  cmn: 'zh',
  zho: 'zh',
  chi: 'zh',
  afr: 'af',
  ara: 'ar',
  hye: 'hy',
  arm: 'hy',
  asm: 'as',
  aze: 'az',
  bel: 'be',
  ben: 'bn',
  bos: 'bs',
  bul: 'bg',
  mya: 'my',
  bur: 'my',
  cat: 'ca',
  nya: 'ny',
  hrv: 'hr',
  ces: 'cs',
  cze: 'cs',
  dan: 'da',
  nld: 'nl',
  dut: 'nl',
  eng: 'en',
  est: 'et',
  fin: 'fi',
  fra: 'fr',
  fre: 'fr',
  glg: 'gl',
  kat: 'ka',
  geo: 'ka',
  deu: 'de',
  ger: 'de',
  ell: 'el',
  gre: 'el',
  guj: 'gu',
  hau: 'ha',
  hin: 'hi',
  hun: 'hu',
  isl: 'is',
  ice: 'is',
  gle: 'ga',
  ita: 'it',
  jpn: 'ja',
  jav: 'jv',
  kan: 'kn',
  kaz: 'kk',
  kir: 'ky',
  kor: 'ko',
  lav: 'lv',
  lin: 'ln',
  lit: 'lt',
  ltz: 'lb',
  mkd: 'mk',
  mac: 'mk',
  msa: 'ms',
  may: 'ms',
  zsm: 'ms',
  mal: 'ml',
  mlt: 'mt',
  mri: 'mi',
  mao: 'mi',
  mar: 'mr',
  mon: 'mn',
  nep: 'ne',
  oci: 'oc',
  ori: 'or',
  ory: 'or',
  pus: 'ps',
  fas: 'fa',
  per: 'fa',
  pes: 'fa',
  prs: 'fa',
  pol: 'pl',
  por: 'pt',
  pan: 'pa',
  ron: 'ro',
  rum: 'ro',
  rus: 'ru',
  srp: 'sr',
  snd: 'sd',
  slk: 'sk',
  slo: 'sk',
  slv: 'sl',
  som: 'so',
  spa: 'es',
  swa: 'sw',
  swh: 'sw',
  swe: 'sv',
  tgk: 'tg',
  tam: 'ta',
  tel: 'te',
  tha: 'th',
  tur: 'tr',
  ukr: 'uk',
  urd: 'ur',
  uzb: 'uz',
  uzn: 'uz',
  vie: 'vi',
  cym: 'cy',
  wel: 'cy',
  yor: 'yo',
}

/**
 * A provider's language as the board's code ("fil" is "tl", "nya" is "ny", "zh-CN" is "zh"). An
 * unknown code comes back lowercased without its region; see boardLanguageCode for board-only.
 */
export function boardLanguage(language: string | undefined): string | undefined {
  if (!language) return undefined
  const base = language.split(/[-_]/)[0]?.toLowerCase()
  return base ? (BOARD_ALIASES[base] ?? base) : undefined
}

/** A provider's language as a board language, or undefined when the board doesn't have it. */
export function boardLanguageCode(language: string | undefined): LanguageCode | undefined {
  const code = boardLanguage(language)
  return isLanguageCode(code) ? code : undefined
}

/** Board codes Scribe takes under another name: 2-letter "ny" and "ln" are rejected (checked). */
const SCRIBE_ALIASES: Readonly<Record<string, string>> = { tl: 'fil', ny: 'nya', ln: 'lin' }

/**
 * language_code values Scribe v2 Realtime accepted for the board languages (a session started
 * with each; made-up codes are refused, so this is checked). A room language outside this set is
 * auto-detected.
 */
const SCRIBE_HINTS: ReadonlySet<string> = new Set(
  (
    'en es zh pt hi gu ko ar pl af hy as az bn bs bg yue ca cs da nl et fil fi fr gl de el he hu ' +
    'is id it ja kn kk lv lt mk ms ml mr ne no or fa pa ro ru sk sl sw sv ta te th tr uk ur vi ' +
    'ast be my ceb nya hr ka ha ga jv ky lin lb mt mi mn oc ps sr sd so tg uz cy yo'
  ).split(' '),
)

/** The Scribe language_code for a room language, or undefined (auto-detect). */
export function scribeLanguageHint(language: string): string | undefined {
  if (language === 'auto') return undefined
  const code = SCRIBE_ALIASES[language] ?? language
  return SCRIBE_HINTS.has(code) ? code : undefined
}

// Writing systems, to catch a transcript whose script contradicts its language (Scribe wrote
// Gujarati speech in Devanagari and tagged it "hi").
const SCRIPTS: ReadonlyArray<readonly [string, RegExp]> = [
  ['Latin', /\p{Script=Latin}/gu],
  ['Devanagari', /\p{Script=Devanagari}/gu],
  ['Gujarati', /\p{Script=Gujarati}/gu],
  ['Bengali', /\p{Script=Bengali}/gu],
  ['Gurmukhi', /\p{Script=Gurmukhi}/gu],
  ['Tamil', /\p{Script=Tamil}/gu],
  ['Telugu', /\p{Script=Telugu}/gu],
  ['Kannada', /\p{Script=Kannada}/gu],
  ['Malayalam', /\p{Script=Malayalam}/gu],
  ['Oriya', /\p{Script=Oriya}/gu],
  ['Arabic', /\p{Script=Arabic}/gu],
  ['Hebrew', /\p{Script=Hebrew}/gu],
  ['Cyrillic', /\p{Script=Cyrillic}/gu],
  ['Greek', /\p{Script=Greek}/gu],
  ['Armenian', /\p{Script=Armenian}/gu],
  ['Georgian', /\p{Script=Georgian}/gu],
  ['Myanmar', /\p{Script=Myanmar}/gu],
  ['Thai', /\p{Script=Thai}/gu],
  ['Hangul', /\p{Script=Hangul}/gu],
  ['Kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/gu],
  ['Han', /\p{Script=Han}/gu],
]

/** The writing system most of the text's letters are in, or undefined (no letters). */
export function dominantScript(text: string): string | undefined {
  let best: string | undefined
  let bestCount = 0
  for (const [script, pattern] of SCRIPTS) {
    const count = text.match(pattern)?.length ?? 0
    if (count > bestCount) {
      best = script
      bestCount = count
    }
  }
  return best
}

/** Scripts a language is normally written in; anything not listed is Latin. */
const LANGUAGE_SCRIPTS: Readonly<Record<string, readonly string[]>> = {
  hi: ['Devanagari'],
  mr: ['Devanagari'],
  ne: ['Devanagari'],
  gu: ['Gujarati'],
  bn: ['Bengali'],
  as: ['Bengali'],
  pa: ['Gurmukhi'],
  ta: ['Tamil'],
  te: ['Telugu'],
  kn: ['Kannada'],
  ml: ['Malayalam'],
  or: ['Oriya'],
  ar: ['Arabic'],
  fa: ['Arabic'],
  ur: ['Arabic'],
  ps: ['Arabic'],
  sd: ['Arabic'],
  he: ['Hebrew'],
  ru: ['Cyrillic'],
  uk: ['Cyrillic'],
  bg: ['Cyrillic'],
  mk: ['Cyrillic'],
  kk: ['Cyrillic'],
  be: ['Cyrillic'],
  ky: ['Cyrillic'],
  mn: ['Cyrillic'],
  tg: ['Cyrillic'],
  sr: ['Cyrillic', 'Latin'],
  bs: ['Latin', 'Cyrillic'],
  uz: ['Latin', 'Cyrillic'],
  ka: ['Georgian'],
  my: ['Myanmar'],
  el: ['Greek'],
  hy: ['Armenian'],
  th: ['Thai'],
  ko: ['Hangul', 'Han'],
  zh: ['Han'],
  yue: ['Han'],
  ja: ['Kana', 'Han'],
}

/** Whether `text` is written in a script `language` uses (true when either is unknown). */
export function scriptFits(text: string, language: string | undefined): boolean {
  const script = dominantScript(text)
  if (!script || !language) return true
  const base = boardLanguage(language) ?? language
  return (LANGUAGE_SCRIPTS[base] ?? ['Latin']).includes(script)
}
