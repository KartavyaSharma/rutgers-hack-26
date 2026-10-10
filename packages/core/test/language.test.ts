import { describe, expect, it } from 'vitest'
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
    ['Mwen bezwen yon dra tanpri', 'ht'],
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
  ])('canonicalLanguage(%j) = %s', (code, expected) => {
    expect(canonicalLanguage(code)).toBe(expected)
  })

  it('returns null for languages we have no strings for', () => {
    expect(canonicalLanguage('sw')).toBeNull()
    expect(replyLanguage('sw')).toBe('en')
    expect(replyLanguage('auto')).toBe('en')
  })

  it.each([
    ['zh-CN', 'zh'],
    ['fil', 'tl'],
    ['Tagalog', 'tl'],
    ['Haitian Creole', 'ht'],
    ['Kreyòl ayisyen', 'ht'],
    ['Tiếng Việt', 'vi'],
    ['한국어', 'ko'],
    ['العربية', 'ar'],
    ['Polski', 'pl'],
    ['sw', 'sw'],
  ])('normalizeLanguageCode(%j) = %s', (raw, expected) => {
    expect(normalizeLanguageCode(raw, '')).toBe(expected)
  })

  it('falls back to guessing from the text', () => {
    expect(normalizeLanguageCode('', 'Mwen bezwen èd')).toBe('ht')
    expect(normalizeLanguageCode('???', '가슴이 아파요')).toBe('ko')
  })
})
