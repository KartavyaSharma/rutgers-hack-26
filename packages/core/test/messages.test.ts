import { describe, expect, it } from 'vitest'
import {
  HELP_BUTTON_LABELS,
  helpButtonLabel,
  LANGUAGES,
  NURSE_BUTTON,
  PATIENT_MESSAGE_KEYS,
  patientMessage,
  quotePatientWords,
} from '../src'

describe('patientMessage', () => {
  it('has every key in every room language', () => {
    for (const key of PATIENT_MESSAGE_KEYS) {
      const english = patientMessage(key, 'en')
      for (const { code } of LANGUAGES) {
        const message = patientMessage(key, code)
        expect(message.length).toBeGreaterThan(0)
        // "Un momento." is the same in Spanish, Portuguese and Italian, never in English.
        if (code !== 'en') expect(message).not.toBe(english)
      }
    }
  })

  it('uses English for "auto" and unknown codes, and the primary subtag otherwise', () => {
    expect(patientMessage('sent', 'auto')).toBe("Sent. Someone's coming.")
    expect(patientMessage('sent', 'xx')).toBe("Sent. Someone's coming.")
    expect(patientMessage('sent', 'pt-BR')).toBe(patientMessage('sent', 'pt'))
  })

  it('has the agreed English strings', () => {
    expect(patientMessage('sent', 'en')).toBe("Sent. Someone's coming.")
    expect(patientMessage('sent_two', 'en')).toBe("Both sent. Someone's coming.")
    expect(patientMessage('sent_many', 'en')).toBe("All sent. Someone's coming.")
    expect(patientMessage('nurse_notified', 'en')).toBe('Your nurse is on the way.')
    expect(patientMessage('ask_again', 'en')).toBe('Okay. What do you need?')
    expect(patientMessage('say_again', 'en')).toBe('Sorry, say that again?')
    expect(patientMessage('save_failed', 'en')).toBe(
      "Couldn't send that. Press “I need help immediately”.",
    )
    expect(patientMessage('emergency_listening', 'en')).toBe("I'm here. What's wrong?")
    expect(patientMessage('emergency_noted', 'en')).toBe("Got it. Help's coming.")
    expect(patientMessage('cancelled', 'en')).toBe('Okay, cancelled.')
    expect(patientMessage('one_moment', 'en')).toBe('One sec.')
    expect(patientMessage('listening_intro', 'en')).toBe("Go ahead, I'm listening.")
  })

  it('keeps the spoken lines short', () => {
    const words = (text: string) => text.match(/[\p{L}\p{N}']+/gu)?.length ?? 0
    for (const key of PATIENT_MESSAGE_KEYS) {
      const message = patientMessage(key, 'en')
      if (key === 'save_failed') {
        expect(words(message.replace(HELP_BUTTON_LABELS.en, ''))).toBeLessThanOrEqual(4)
      } else {
        expect(words(message)).toBeLessThanOrEqual(6)
      }
    }
  })

  it('localizes the new messages', () => {
    expect(patientMessage('emergency_listening', 'es')).toBe('Aquí estoy. ¿Qué pasa?')
    expect(patientMessage('emergency_noted', 'es')).toBe('Entendido. Ya viene ayuda.')
    expect(patientMessage('listening_intro', 'es')).toBe('Dime, te escucho.')
    expect(patientMessage('listening_intro', 'zh')).toBe('请说，我在听。')
    expect(patientMessage('cancelled', 'fr')).toBe("D'accord, c'est annulé.")
    expect(patientMessage('one_moment', 'de')).toBe('Einen Moment.')
    expect(patientMessage('one_moment', 'ja')).toBe('少しお待ちください。')
    expect(patientMessage('say_again', 'es')).toBe('Perdona, ¿me lo repites?')
    expect(patientMessage('say_again', 'zh')).toBe('不好意思，请再说一遍？')
    expect(patientMessage('sent_two', 'es')).toBe('Enviados los dos. Ya viene alguien.')
    expect(patientMessage('sent_many', 'ko')).toBe('다 보냈어요. 곧 누가 올 거예요.')
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

describe('HELP_BUTTON_LABELS', () => {
  // The 12 room languages plus the extra reply languages auto-detect can land on.
  const codes = [...LANGUAGES.map((l) => l.code), 'fr', 'de', 'ja', 'it', 'nl'] as const

  it('has a label for every room language plus the extras, and nothing else', () => {
    expect(Object.keys(HELP_BUTTON_LABELS).sort()).toEqual([...codes].sort())
    for (const code of codes) expect(HELP_BUTTON_LABELS[code].length).toBeGreaterThan(0)
  })

  it('matches the nurse button in English', () => {
    expect(HELP_BUTTON_LABELS.en).toBe(NURSE_BUTTON.label)
  })

  it('save_failed names the button with exactly the same words, in every language', () => {
    for (const code of codes) {
      expect(patientMessage('save_failed', code)).toContain(HELP_BUTTON_LABELS[code])
    }
    expect(patientMessage('save_failed', 'es')).toBe(
      'No se pudo enviar. Pulsa “Necesito ayuda inmediata”.',
    )
    expect(patientMessage('save_failed', 'de')).toBe(
      'Senden hat nicht geklappt. Drücken Sie „Ich brauche sofort Hilfe“.',
    )
  })

  it('helpButtonLabel falls back to English for "auto" and unknown codes', () => {
    expect(helpButtonLabel('fr')).toBe("J'ai besoin d'aide immédiatement")
    expect(helpButtonLabel('pt-BR')).toBe('Preciso de ajuda imediata')
    expect(helpButtonLabel('auto')).toBe('I need help immediately')
    expect(helpButtonLabel('xx')).toBe('I need help immediately')
  })
})

describe('new room languages', () => {
  it('has the six new languages for every key', () => {
    for (const code of ['tl', 'ht', 'ar', 'ko', 'vi', 'pl'] as const) {
      for (const key of PATIENT_MESSAGE_KEYS) {
        expect(patientMessage(key, code)).not.toBe(patientMessage(key, 'en'))
      }
    }
    expect(patientMessage('cancelled', 'vi')).toBe('Vâng, đã hủy.')
    expect(patientMessage('one_moment', 'ko')).toBe('잠깐만요.')
    expect(patientMessage('sent', 'pl')).toBe('Wysłane. Ktoś zaraz przyjdzie.')
  })

  it('maps region and alias codes, and falls back to English', () => {
    expect(patientMessage('sent', 'zh-CN')).toBe(patientMessage('sent', 'zh'))
    expect(patientMessage('sent', 'zh_TW')).toBe(patientMessage('sent', 'zh'))
    expect(patientMessage('sent', 'pt-BR')).toBe(patientMessage('sent', 'pt'))
    expect(patientMessage('sent', 'fil')).toBe(patientMessage('sent', 'tl'))
    expect(patientMessage('sent', 'ar-EG')).toBe(patientMessage('sent', 'ar'))
    expect(patientMessage('sent', 'auto')).toBe(patientMessage('sent', 'en'))
    expect(patientMessage('sent', 'sw')).toBe(patientMessage('sent', 'en'))
  })

  it('quotes in Arabic and Polish style', () => {
    expect(quotePatientWords('أحتاج بطانية', 'ar')).toBe('«أحتاج بطانية»')
    expect(quotePatientWords('potrzebuję koca', 'pl')).toBe('„potrzebuję koca”')
    expect(patientMessage('save_failed', 'ar')).toContain(`«${HELP_BUTTON_LABELS.ar}»`)
  })
})
