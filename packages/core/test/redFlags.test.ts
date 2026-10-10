import { describe, expect, it } from 'vitest'
import { detectRedFlag } from '../src'

describe('detectRedFlag', () => {
  it.each([
    ['I have chest pain', 'chest_pain', 'en'],
    ["I can't breathe", 'breathing', 'en'],
    ['I CAN’T BREATHE!!', 'breathing', 'en'],
    ['cant breath', 'breathing', 'en'],
    ['I cannot breathe properly', 'breathing', 'en'],
    ["I'm short of breath", 'breathing', 'en'],
    ['I fell in the bathroom', 'fall', 'en'],
    ["I'm on the floor", 'fall', 'en'],
    ['my arm is bleeding a lot', 'bleeding', 'en'],
    ["he's choking", 'choking', 'en'],
    ['my face is drooping', 'stroke_signs', 'en'],
    ["I can't move my left arm", 'stroke_signs', 'en'],
    ['my wife passed out', 'unresponsive', 'en'],
    ['the pain is unbearable', 'severe_pain', 'en'],
    ['severe pain in my leg', 'severe_pain', 'en'],
    ['I want to die', 'self_harm', 'en'],
    ["I'm feeling suicidal", 'self_harm', 'en'],
    ['allergic reaction, my throat is swelling', 'allergic_reaction', 'en'],
    ["I think I'm having a seizure", 'seizure', 'en'],
    ['me duele el pecho', 'chest_pain', 'es'],
    ['Me duele el pecho!', 'chest_pain', 'es'],
    ['no puedo respirar', 'breathing', 'es'],
    ['me caí en el baño', 'fall', 'es'],
    ['estoy sangrando mucho', 'bleeding', 'es'],
    ['mi esposo se desmayó', 'unresponsive', 'es'],
    ['quiero morir', 'self_harm', 'es'],
    ['je suis tombé', 'fall', 'fr'],
    ["j'ai mal à la poitrine", 'chest_pain', 'fr'],
    ['estou com dor no peito', 'chest_pain', 'pt'],
    ['não consigo respirar', 'breathing', 'pt'],
    ['ich kann nicht atmen', 'breathing', 'de'],
    ['ich bin gefallen', 'fall', 'de'],
    ['non riesco a respirare', 'breathing', 'it'],
    ['ik heb pijn op de borst', 'chest_pain', 'nl'],
    ['у меня боль в груди', 'chest_pain', 'ru'],
    ['胸が痛いです', 'chest_pain', 'ja'],
    ['我胸口痛', 'chest_pain', 'zh'],
    ['मेरे सीने में दर्द हो रहा है', 'chest_pain', 'hi'],
  ])('flags %j as %s (%s)', (text, category, language) => {
    expect(detectRedFlag(text)).toMatchObject({ category, language })
  })

  it('reports the phrase it matched', () => {
    expect(detectRedFlag('Help, I CAN’T breathe')).toEqual({
      phrase: 'cant breathe',
      language: 'en',
      category: 'breathing',
    })
  })

  it.each([
    'can I get another blanket',
    'I fell asleep and missed lunch',
    'my phone fell on the floor',
    'my glasses fell off the table',
    'can I see my blood test results',
    'it is not an emergency, but can I get some water',
    'necesito un análisis de sangre',
    'o quarto está sem ar condicionado',
    'the TV remote is broken',
    '',
    '   ',
  ])('does not flag %j', (text) => {
    expect(detectRedFlag(text)).toBeNull()
  })
})

describe('detectRedFlag: tl, ht, ar, ko, vi, pl', () => {
  it.each([
    // Tagalog
    ['Masakit ang dibdib ko', 'chest_pain', 'tl'],
    ['Hindi ako makahinga', 'breathing', 'tl'],
    ['Nahulog ako sa banyo', 'fall', 'tl'],
    ['Dumudugo ang sugat ko', 'bleeding', 'tl'],
    ['Saklolo!', 'emergency', 'tl'],
    ['Hindi ko maigalaw ang braso ko', 'stroke_signs', 'tl'],
    // Haitian Creole
    ['Mwen gen doulè nan pwatrin', 'chest_pain', 'ht'],
    ['Mwen pa ka respire', 'breathing', 'ht'],
    ['Mwen tonbe nan twalèt la', 'fall', 'ht'],
    ["M'ap senyen anpil", 'bleeding', 'ht'],
    ['Anmwe!', 'emergency', 'ht'],
    ['Figi mwen tòde', 'stroke_signs', 'ht'],
    // Arabic
    ['عندي ألم في الصدر', 'chest_pain', 'ar'],
    ['لا أستطيع التنفس', 'breathing', 'ar'],
    ['أنا وقعت في الحمام', 'fall', 'ar'],
    ['عندي نزيف', 'bleeding', 'ar'],
    ['النجدة', 'emergency', 'ar'],
    ['وجهي مائل', 'stroke_signs', 'ar'],
    // Korean
    ['가슴이 아파요', 'chest_pain', 'ko'],
    ['가슴이아파요', 'chest_pain', 'ko'],
    ['숨을 못 쉬겠어요', 'breathing', 'ko'],
    ['제가 넘어졌어요', 'fall', 'ko'],
    ['피가 나요', 'bleeding', 'ko'],
    ['살려 주세요', 'emergency', 'ko'],
    ['말이 어눌해요', 'stroke_signs', 'ko'],
    // Vietnamese, with and without diacritics
    ['Tôi bị đau ngực', 'chest_pain', 'vi'],
    ['toi bi dau nguc', 'chest_pain', 'vi'],
    ['Tôi không thở được', 'breathing', 'vi'],
    ['Tôi bị ngã trong nhà vệ sinh', 'fall', 'vi'],
    ['Tôi đang chảy máu', 'bleeding', 'vi'],
    ['Cứu tôi với', 'emergency', 'vi'],
    ['Mẹ tôi bị méo miệng', 'stroke_signs', 'vi'],
    // Polish
    ['Boli mnie w klatce piersiowej', 'chest_pain', 'pl'],
    ['Nie mogę oddychać', 'breathing', 'pl'],
    ['Upadłem w łazience', 'fall', 'pl'],
    ['Krwawię', 'bleeding', 'pl'],
    ['Ratunku!', 'emergency', 'pl'],
    ['Nie mogę ruszyć ręką', 'stroke_signs', 'pl'],
  ])('flags %j as %s (%s)', (text, category, language) => {
    expect(detectRedFlag(text)).toMatchObject({ category, language })
  })

  it.each([
    // Things falling are not patients falling.
    'Nahulog ang telepono ko',
    'Telefòn mwen tonbe',
    'Điện thoại của tôi bị rơi',
    'Telefon mi upadł',
    'الصينية وقعت على الأرض',
    '휴대폰이 떨어졌어요',
    '의자가 넘어졌어요',
    // Everyday requests.
    'Kailangan ko po ng kumot',
    'Mwen bezwen yon dra tanpri',
    'أحتاج بطانية من فضلك',
    '담요 좀 주세요',
    '도와주세요',
    'Cho tôi thêm một xíu nước',
    'Đi từ từ thôi',
    'Potrzebuję koca, proszę',
    // "Not an emergency".
    'Se pa yon ijans',
    'Không phải cấp cứu',
    'To nie nagły wypadek',
  ])('does not flag %j', (text) => {
    expect(detectRedFlag(text)).toBeNull()
  })
})
