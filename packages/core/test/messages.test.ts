import { describe, expect, it } from 'vitest'
import {
  classifyConfirmation,
  draftReadBack,
  LANGUAGES,
  PATIENT_MESSAGE_KEYS,
  patientMessage,
  quotePatientWords,
} from '../src'

describe('classifyConfirmation', () => {
  it.each([
    // en
    'yes',
    'Yes.',
    'YES!!',
    'yes please',
    'yeah send it',
    'yep',
    'sure',
    'okay',
    'correct',
    "that's right",
    'that’s right',
    'um, yes, thank you',
    'yes yes',
    'go ahead',
    // es
    'sí',
    'Sí, por favor',
    'si',
    'claro que sí',
    'claro',
    'vale',
    // fr
    'oui',
    "oui, c'est ça",
    "d'accord",
    // de
    'ja',
    'ja bitte',
    'genau',
    // it
    'sì',
    'va bene',
    // pt
    'sim',
    'sim, pode mandar',
    // nl
    'ja graag',
    'dat klopt',
    // ru
    'да',
    'да, пожалуйста',
    // ja
    'はい',
    'はい、お願いします',
    // hi
    'हाँ',
    'हां जी',
    'जी हाँ',
    // zh
    '是的',
    '好的',
  ])('%j is yes', (text) => {
    expect(classifyConfirmation(text)).toBe('yes')
  })

  it.each([
    'no',
    'No.',
    'nope',
    'no thanks',
    'no thank you',
    "don't send it",
    'never mind',
    'no, gracias',
    'non',
    'non merci',
    'nein',
    'nein danke',
    'いいえ',
    'नहीं',
    'нет',
    'não',
    'nee',
    '不要',
  ])('%j is no', (text) => {
    expect(classifyConfirmation(text)).toBe('no')
  })

  it.each([
    'no, I wanted a blanket',
    'No I meant a pillow',
    'yes and my chest hurts',
    'yes, also my IV is beeping',
    'sí, y también agua',
    'no, quería una manta',
    'non, je voulais une couverture',
    'can I get another blanket',
    'yes no',
    'please',
    'thank you',
    '',
    '   ',
    'はい、それと水',
  ])('%j is other (route it again)', (text) => {
    expect(classifyConfirmation(text)).toBe('other')
  })

  it('accepts a language argument and still recognises other languages', () => {
    expect(classifyConfirmation('sí', 'en')).toBe('yes')
    expect(classifyConfirmation('yes', 'es')).toBe('yes')
    expect(classifyConfirmation('nein', 'auto')).toBe('no')
  })

  it('never throws on non-string input', () => {
    expect(classifyConfirmation(undefined as unknown as string)).toBe('other')
  })
})

describe('patientMessage', () => {
  it('has every key in every room language', () => {
    for (const key of PATIENT_MESSAGE_KEYS) {
      const english = patientMessage(key, 'en')
      for (const { code } of LANGUAGES) {
        const message = patientMessage(key, code)
        expect(message.length).toBeGreaterThan(0)
        if (code !== 'en') expect(message).not.toBe(english)
      }
    }
  })

  it('uses English for "auto" and unknown codes, and the primary subtag otherwise', () => {
    expect(patientMessage('confirm_prompt', 'auto')).toBe('Say yes, or tap Send.')
    expect(patientMessage('confirm_prompt', 'xx')).toBe('Say yes, or tap Send.')
    expect(patientMessage('sent', 'pt-BR')).toBe(patientMessage('sent', 'pt'))
  })

  it('has the agreed English strings', () => {
    expect(patientMessage('confirm_prompt', 'en')).toBe('Say yes, or tap Send.')
    expect(patientMessage('sent', 'en')).toBe('Sent. Someone will be with you soon.')
    expect(patientMessage('nurse_notified', 'en')).toBe("I've let your nurse know.")
    expect(patientMessage('ask_again', 'en')).toBe('Okay. What do you need?')
    expect(patientMessage('not_sent', 'en')).toBe('Not sent yet')
    expect(patientMessage('save_failed', 'en')).toBe(
      "Sorry, I couldn't send that. Please press the My nurse button.",
    )
  })
})

describe('draftReadBack', () => {
  it('appends the localized confirm prompt to the read-back', () => {
    expect(draftReadBack({ patientReply: 'An extra pillow.', language: 'en' })).toBe(
      'An extra pillow. Say yes, or tap Send.',
    )
    expect(draftReadBack({ patientReply: 'Una almohada más.', language: 'es' })).toBe(
      'Una almohada más. Diga sí, o toque Enviar.',
    )
  })

  it('joins without a space in Japanese and Chinese', () => {
    expect(draftReadBack({ patientReply: '枕をもう一つ。', language: 'ja' })).toBe(
      '枕をもう一つ。「はい」と言うか、「送信」をタップしてください。',
    )
  })

  it('falls back to just the prompt when there is no read-back', () => {
    expect(draftReadBack({ patientReply: '  ', language: 'fr' })).toBe(
      'Dites oui, ou touchez Envoyer.',
    )
  })
})

describe('quotePatientWords', () => {
  it('quotes on one line with local quotation marks', () => {
    expect(quotePatientWords('my thing\nis weird', 'en')).toBe('“my thing is weird”')
    expect(quotePatientWords('mon truc', 'fr')).toBe('« mon truc »')
    expect(quotePatientWords('mein Ding', 'de')).toBe('„mein Ding“')
    expect(quotePatientWords('枕', 'ja')).toBe('「枕」')
  })
})
