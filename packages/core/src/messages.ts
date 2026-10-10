// Patient-facing strings for the tablet and the voice agent.
// Effect-free: client components import this via `@bell/core/messages`.
// Patient-facing text never names a team.
import { oneLine, replyLanguage, type SupportedLanguage } from './language'
import type { LanguageCode, LanguagePreference } from './taxonomy'

export const PATIENT_MESSAGE_KEYS = [
  'sent',
  'nurse_notified',
  'ask_again',
  'save_failed',
  'emergency_listening',
  'emergency_noted',
  'cancelled',
  'one_moment',
] as const
export type PatientMessageKey = (typeof PATIENT_MESSAGE_KEYS)[number]

// Quotation marks per language; everything else uses “ ”.
const QUOTES: Partial<Record<SupportedLanguage, readonly [string, string]>> = {
  fr: ['« ', ' »'],
  de: ['„', '“'],
  ru: ['«', '»'],
  ja: ['「', '」'],
}

const quoted = (text: string, language: SupportedLanguage): string => {
  const [open, close] = QUOTES[language] ?? ['“', '”']
  return `${open}${text}${close}`
}

/**
 * The "I need help immediately" button's label in each language. The tablet button and the
 * save_failed message both use these, so the words always match. English equals NURSE_BUTTON.label.
 */
export const HELP_BUTTON_LABELS: Readonly<Record<LanguageCode | 'zh', string>> = {
  en: 'I need help immediately',
  es: 'Necesito ayuda inmediata',
  fr: "J'ai besoin d'aide immédiatement",
  de: 'Ich brauche sofort Hilfe',
  hi: 'मुझे तुरंत मदद चाहिए',
  ru: 'Мне срочно нужна помощь',
  pt: 'Preciso de ajuda imediata',
  ja: 'すぐに助けが必要です',
  it: 'Ho bisogno di aiuto subito',
  nl: 'Ik heb direct hulp nodig',
  zh: '我需要紧急帮助',
}

/** The help button's label, quoted the way each language quotes a button name. */
const helpButton = (language: SupportedLanguage): string =>
  quoted(HELP_BUTTON_LABELS[language], language)

const MESSAGES: Record<PatientMessageKey, Record<SupportedLanguage, string>> = {
  sent: {
    en: 'Sent. Someone will be with you soon.',
    es: 'Enviado. Alguien vendrá pronto.',
    fr: "Envoyé. Quelqu'un va venir bientôt.",
    de: 'Gesendet. Gleich kommt jemand zu Ihnen.',
    hi: 'भेज दिया गया। कोई जल्द ही आपके पास आएगा।',
    ru: 'Отправлено. Скоро к вам подойдут.',
    pt: 'Enviado. Alguém virá em breve.',
    ja: '送信しました。まもなく担当者が伺います。',
    it: 'Inviato. Qualcuno arriverà presto.',
    nl: 'Verstuurd. Er komt zo iemand bij u.',
    zh: '已发送。很快会有人来帮您。',
  },
  nurse_notified: {
    en: "I've let your nurse know.",
    es: 'Le he avisado a su enfermera.',
    fr: "J'ai prévenu votre infirmière.",
    de: 'Ich habe Ihrer Pflegekraft Bescheid gegeben.',
    hi: 'मैंने आपकी नर्स को बता दिया है।',
    ru: 'Ваша медсестра предупреждена.',
    pt: 'Avisei a sua enfermeira.',
    ja: '看護師に知らせました。',
    it: "Ho avvisato l'infermiere.",
    nl: 'Ik heb uw verpleegkundige ingelicht.',
    zh: '我已通知您的护士。',
  },
  ask_again: {
    en: 'Okay. What do you need?',
    es: 'De acuerdo. ¿Qué necesita?',
    fr: "D'accord. De quoi avez-vous besoin ?",
    de: 'Okay. Was brauchen Sie?',
    hi: 'ठीक है। आपको क्या चाहिए?',
    ru: 'Хорошо. Что вам нужно?',
    pt: 'Certo. Do que você precisa?',
    ja: 'わかりました。何が必要ですか？',
    it: 'Va bene. Di cosa ha bisogno?',
    nl: 'Oké. Wat heeft u nodig?',
    zh: '好的。您需要什么？',
  },
  save_failed: {
    en: `Sorry, I couldn't send that. If you need help, press ${helpButton('en')}.`,
    es: `Lo siento, no pude enviarlo. Si necesita ayuda, pulse ${helpButton('es')}.`,
    fr: `Désolé, je n'ai pas pu l'envoyer. Si vous avez besoin d'aide, appuyez sur ${helpButton('fr')}.`,
    de: `Entschuldigung, das konnte ich nicht senden. Wenn Sie Hilfe brauchen, drücken Sie ${helpButton('de')}.`,
    hi: `माफ़ कीजिए, यह भेजा नहीं जा सका। अगर आपको मदद चाहिए, तो ${helpButton('hi')} दबाएँ।`,
    ru: `Извините, не удалось отправить. Если вам нужна помощь, нажмите ${helpButton('ru')}.`,
    pt: `Desculpe, não consegui enviar. Se precisar de ajuda, toque em ${helpButton('pt')}.`,
    ja: `申し訳ありません、送信できませんでした。助けが必要な場合は、${helpButton('ja')}を押してください。`,
    it: `Mi dispiace, non sono riuscito a inviarlo. Se ha bisogno di aiuto, prema ${helpButton('it')}.`,
    nl: `Sorry, dat kon ik niet versturen. Als u hulp nodig heeft, druk dan op ${helpButton('nl')}.`,
    zh: `抱歉，无法发送。如需帮助，请按${helpButton('zh')}。`,
  },
  emergency_listening: {
    en: "I'm listening. Tell us what's wrong, if you can.",
    es: 'Le escucho. Díganos qué pasa, si puede.',
    fr: 'Je vous écoute. Dites-nous ce qui ne va pas, si vous le pouvez.',
    de: 'Ich höre zu. Sagen Sie uns, was los ist, wenn Sie können.',
    hi: 'हम सुन रहे हैं। अगर हो सके, तो बताइए क्या परेशानी है।',
    ru: 'Я слушаю. Скажите, что случилось, если можете.',
    pt: 'Estou ouvindo. Diga-nos o que está acontecendo, se puder.',
    ja: 'お聞きしています。できれば、どうされたか教えてください。',
    it: 'La ascolto. Ci dica cosa succede, se può.',
    nl: 'Ik luister. Vertel ons wat er aan de hand is, als dat lukt.',
    zh: '我在听。如果可以，请告诉我们发生了什么。',
  },
  emergency_noted: {
    en: 'Thank you. Your nurse is on the way.',
    es: 'Gracias. Su enfermera está en camino.',
    fr: 'Merci. Votre infirmière arrive.',
    de: 'Danke. Ihre Pflegekraft ist unterwegs.',
    hi: 'धन्यवाद। आपकी नर्स आ रही है।',
    ru: 'Спасибо. Ваша медсестра уже идёт.',
    pt: 'Obrigado. Sua enfermeira está a caminho.',
    ja: 'ありがとうございます。看護師が向かっています。',
    it: "Grazie. L'infermiere sta arrivando.",
    nl: 'Dank u. Uw verpleegkundige is onderweg.',
    zh: '谢谢。您的护士正在赶来。',
  },
  cancelled: {
    en: 'Okay, I cancelled that.',
    es: 'De acuerdo, lo he cancelado.',
    fr: "D'accord, je l'ai annulé.",
    de: 'In Ordnung, ich habe das abgesagt.',
    hi: 'ठीक है, मैंने इसे रद्द कर दिया है।',
    ru: 'Хорошо, запрос отменён.',
    pt: 'Certo, eu cancelei isso.',
    ja: 'わかりました。取り消しました。',
    it: "Va bene, l'ho annullato.",
    nl: 'Oké, ik heb dat geannuleerd.',
    zh: '好的，已为您取消。',
  },
  one_moment: {
    en: 'One moment.',
    es: 'Un momento.',
    fr: 'Un instant.',
    de: 'Einen Moment.',
    hi: 'एक पल।',
    ru: 'Минутку.',
    pt: 'Um momento.',
    ja: '少々お待ちください。',
    it: 'Un momento.',
    nl: 'Een ogenblik.',
    zh: '请稍等。',
  },
}

/** A patient-facing message in the given language. "auto" or an unknown code gives English. */
export const patientMessage = (
  key: PatientMessageKey,
  language: LanguagePreference | string,
): string => MESSAGES[key][replyLanguage(language)]

/** The help button's label for the tablet. "auto" or an unknown code gives English. */
export const helpButtonLabel = (language: LanguagePreference | string): string =>
  HELP_BUTTON_LABELS[replyLanguage(language)]

/** The patient's own words as a one-line quote, e.g. “my thing is weird”. */
export const quotePatientWords = (text: string, language: LanguagePreference | string): string =>
  quoted(oneLine(text, 120), replyLanguage(language))
