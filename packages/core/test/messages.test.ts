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
    expect(patientMessage('sent', 'auto')).toBe('Sent. Someone will be with you soon.')
    expect(patientMessage('sent', 'xx')).toBe('Sent. Someone will be with you soon.')
    expect(patientMessage('sent', 'pt-BR')).toBe(patientMessage('sent', 'pt'))
  })

  it('has the agreed English strings', () => {
    expect(patientMessage('sent', 'en')).toBe('Sent. Someone will be with you soon.')
    expect(patientMessage('nurse_notified', 'en')).toBe("I've let your nurse know.")
    expect(patientMessage('ask_again', 'en')).toBe('Okay. What do you need?')
    expect(patientMessage('save_failed', 'en')).toBe(
      "Sorry, I couldn't send that. If you need help, press “I need help immediately”.",
    )
    expect(patientMessage('emergency_listening', 'en')).toBe(
      "I'm listening. Tell us what's wrong, if you can.",
    )
    expect(patientMessage('emergency_noted', 'en')).toBe('Thank you. Your nurse is on the way.')
    expect(patientMessage('cancelled', 'en')).toBe('Okay, I cancelled that.')
    expect(patientMessage('one_moment', 'en')).toBe('One moment.')
  })

  it('localizes the new messages', () => {
    expect(patientMessage('emergency_listening', 'es')).toBe(
      'Le escucho. Díganos qué pasa, si puede.',
    )
    expect(patientMessage('emergency_noted', 'es')).toBe('Gracias. Su enfermera está en camino.')
    expect(patientMessage('cancelled', 'fr')).toBe("D'accord, je l'ai annulé.")
    expect(patientMessage('one_moment', 'de')).toBe('Einen Moment.')
    expect(patientMessage('one_moment', 'ja')).toBe('少々お待ちください。')
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
  const codes = [...LANGUAGES.map((l) => l.code), 'zh'] as const

  it('has a label for every room language plus Chinese, and nothing else', () => {
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
      'Lo siento, no pude enviarlo. Si necesita ayuda, pulse “Necesito ayuda inmediata”.',
    )
    expect(patientMessage('save_failed', 'de')).toBe(
      'Entschuldigung, das konnte ich nicht senden. Wenn Sie Hilfe brauchen, drücken Sie „Ich brauche sofort Hilfe“.',
    )
  })

  it('helpButtonLabel falls back to English for "auto" and unknown codes', () => {
    expect(helpButtonLabel('fr')).toBe("J'ai besoin d'aide immédiatement")
    expect(helpButtonLabel('pt-BR')).toBe('Preciso de ajuda imediata')
    expect(helpButtonLabel('auto')).toBe('I need help immediately')
    expect(helpButtonLabel('xx')).toBe('I need help immediately')
  })
})
