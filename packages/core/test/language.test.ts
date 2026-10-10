import { describe, expect, it } from 'vitest'
import { LANGUAGES, PATIENT_MESSAGE_KEYS, patientMessage } from '../src'
import {
  canonicalLanguage,
  guessLanguage,
  normalizeLanguageCode,
  normalizeText,
  replyLanguage,
} from '../src/language'

describe('normalizeText', () => {
  it('strips Vietnamese diacritics, including đ', () => {
    expect(normalizeText('Tôi bị đau ngực!')).toBe('toi bi dau nguc')
    expect(normalizeText('ĐAU NGỰC')).toBe('dau nguc')
    expect(normalizeText('Không thở được')).toBe('khong tho duoc')
  })

  it('strips Polish diacritics, including ł', () => {
    expect(normalizeText('Upadłem, leżę na podłodze')).toBe('upadlem leze na podlodze')
  })

  it('ignores Arabic vowel marks and hamza forms', () => {
    expect(normalizeText('أَلَمٌ فِي الصَّدْرِ')).toBe(normalizeText('ألم في الصدر'))
    expect(normalizeText('أنا')).toBe(normalizeText('انا'))
  })

  it('keeps Korean text matchable (jamo on both sides)', () => {
    expect(normalizeText('가슴이 아파요').startsWith(normalizeText('가슴이 아파'))).toBe(true)
  })
})

describe('guessLanguage', () => {
  it.each([
    ['가슴이 아파요', 'ko'],
    ['أحتاج بطانية', 'ar'],
    ['Tôi cần thêm chăn', 'vi'],
    ['toi can them chan', 'vi'],
    ['Potrzebuję koca, proszę', 'pl'],
    ['Kailangan ko po ng kumot', 'tl'],
    ['我需要毯子', 'zh'],
    ['もう一枚毛布をください', 'ja'],
    ['мне нужно одеяло', 'ru'],
    ['necesito otra almohada', 'es'],
    ['can I get another blanket', 'en'],
  ])('%j -> %s', (text, language) => {
    expect(guessLanguage(text)).toBe(language)
  })

  it('does not mistake French or Portuguese accents for Vietnamese', () => {
    expect(guessLanguage("j'ai besoin d'une couverture, s'il vous plaît")).toBe('fr')
    expect(guessLanguage('preciso de um cobertor, você pode')).toBe('pt')
  })
})

describe('language codes', () => {
  it.each([
    ['zh-CN', 'zh'],
    ['zh_TW', 'zh'],
    ['pt-BR', 'pt'],
    ['fil', 'tl'],
    ['tgl', 'tl'],
    ['ko-KR', 'ko'],
    ['ar-EG', 'ar'],
    ['vie', 'vi'],
    ['EN-us', 'en'],
    ['nb', 'no'],
    ['nn', 'no'],
    ['iw', 'he'],
    ['in', 'id'],
    ['zh-HK', 'yue'],
    ['zh-Hant-HK', 'yue'],
    ['zh-MO', 'yue'],
    ['zh-Hant-TW', 'zh'],
    ['yue', 'yue'],
    ['yue-HK', 'yue'],
    ['pa-IN', 'pa'],
    ['hr', 'hr'],
    ['hrv', 'hr'],
    ['srp', 'sr'],
    ['cym', 'cy'],
    ['zho', 'zh'],
    ['sr-Latn', 'sr'],
    ['mo', 'ro'],
    ['fas', 'fa'],
    ['ory', 'or'],
    ['swh', 'sw'],
  ])('canonicalLanguage(%j) = %s', (code, expected) => {
    expect(canonicalLanguage(code)).toBe(expected)
  })

  it('returns null for languages we have no strings for', () => {
    expect(canonicalLanguage('ht')).toBeNull()
    expect(canonicalLanguage('xh')).toBeNull()
    expect(replyLanguage('xh')).toBe('en')
    expect(replyLanguage('auto')).toBe('en')
  })

  it.each([
    ['zh-CN', 'zh'],
    ['fil', 'tl'],
    ['Tagalog', 'tl'],
    ['Farsi', 'fa'],
    ['Norsk', 'no'],
    ['Cantonese', 'yue'],
    ['ગુજરાતી', 'gu'],
    ['Tiếng Việt', 'vi'],
    ['한국어', 'ko'],
    ['العربية', 'ar'],
    ['Polski', 'pl'],
    ['yo', 'yo'],
  ])('normalizeLanguageCode(%j) = %s', (raw, expected) => {
    expect(normalizeLanguageCode(raw, '')).toBe(expected)
  })

  it('falls back to guessing from the text', () => {
    expect(normalizeLanguageCode('', 'Potrzebuję koca, proszę')).toBe('pl')
    expect(normalizeLanguageCode('???', '가슴이 아파요')).toBe('ko')
  })
})

describe('script detection for the board languages', () => {
  // Every language not written in Latin script, checked against its own message lines.
  const NON_LATIN = [
    'zh',
    'yue',
    'ja',
    'ko',
    'ar',
    'fa',
    'ur',
    'he',
    'hi',
    'mr',
    'ne',
    'bn',
    'as',
    'gu',
    'pa',
    'or',
    'ta',
    'te',
    'kn',
    'ml',
    'th',
    'hy',
    'el',
    'ru',
    'uk',
    'bg',
    'mk',
    'kk',
    'be',
    'sr',
    'ky',
    'mn',
    'tg',
    'ka',
    'my',
    'ps',
    'sd',
  ] as const
  const allLines = (code: string) =>
    PATIENT_MESSAGE_KEYS.map((key) => patientMessage(key, code)).join(' ')

  it('covers every non-Latin board language', () => {
    const latin = LANGUAGES.filter((l) =>
      /^[\p{Script=Latin}\p{Lm}\s.,'()-]+$/u.test(l.nativeLabel),
    )
    expect(NON_LATIN.length + latin.length).toBe(LANGUAGES.length)
  })

  it.each(NON_LATIN)('%s', (code) => {
    expect(guessLanguage(allLines(code))).toBe(code)
  })

  it.each([
    ['મને પાણી જોઈએ છે', 'gu'],
    ['আমার জল দরকার', 'bn'],
    ['মোৰ বিছনাখন সলাব লাগে', 'as'],
    ['எனக்கு தண்ணீர் வேண்டும்', 'ta'],
    ['నాకు నీళ్లు కావాలి', 'te'],
    ['ನನಗೆ ನೀರು ಬೇಕು', 'kn'],
    ['എനിക്ക് വെള്ളം വേണം', 'ml'],
    ['ମୋତେ ପାଣି ଦରକାର', 'or'],
    ['ਮੈਨੂੰ ਪਾਣੀ ਚਾਹੀਦਾ ਹੈ', 'pa'],
    ['ขอน้ำหน่อย', 'th'],
    ['אני צריך מים', 'he'],
    ['Ինձ ջուր է պետք', 'hy'],
    ['Χρειάζομαι νερό', 'el'],
    ['مجھے پانی چاہیے', 'ur'],
    ['मला पाणी हवं आहे', 'mr'],
    ['मलाई पानी चाहियो', 'ne'],
    ['मुझे पानी चाहिए', 'hi'],
    ['我想要水', 'zh'],
    ['我想要啲水', 'yue'],
    ['Мені потрібна вода', 'uk'],
    ['Ќе дојде ли некој?', 'mk'],
    ['Ми трябва вода', 'bg'],
    ['Маған су керек', 'kk'],
  ])('%j -> %s', (text, code) => {
    expect(guessLanguage(text)).toBe(code)
  })
})
