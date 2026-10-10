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
