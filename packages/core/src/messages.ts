// Patient-facing strings for the tablet and the voice agent.
// Effect-free: client components import this via `@bell/core/messages`.
// Patient-facing text never names a team.
import { oneLine, replyLanguage, type SupportedLanguage } from './language'
import type { LanguagePreference } from './taxonomy'

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

// Quotation marks per language; everything else uses “ ”. Arabic uses « »: written in logical
// order, the bidi algorithm mirrors them so they open on the right in right-to-left text.
const QUOTES: Partial<Record<SupportedLanguage, readonly [string, string]>> = {
  fr: ['« ', ' »'],
  de: ['„', '“'],
  pl: ['„', '”'],
  ru: ['«', '»'],
  ar: ['«', '»'],
  ja: ['「', '」'],
}

const quoted = (text: string, language: SupportedLanguage): string => {
  const [open, close] = QUOTES[language] ?? ['“', '”']
  return `${open}${text}${close}`
}

/**
 * The "I need help immediately" button's label in each language: the 12 room languages plus the
 * extra reply languages. The tablet button and the save_failed message both use these, so the
 * words always match. English equals NURSE_BUTTON.label.
 */
export const HELP_BUTTON_LABELS: Readonly<Record<SupportedLanguage, string>> = {
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
  tl: 'Kailangan ko ng tulong ngayon din',
  ht: 'Mwen bezwen èd kounye a',
  ar: 'أحتاج إلى مساعدة فورًا',
  ko: '지금 바로 도움이 필요해요',
  vi: 'Tôi cần giúp đỡ ngay',
  pl: 'Potrzebuję pomocy natychmiast',
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
    tl: 'Naipadala na. May darating sa iyo sa lalong madaling panahon.',
    ht: 'Li voye. Yon moun ap vin kote ou byento.',
    ar: 'تم الإرسال. سيأتي أحد إليك قريبًا.',
    ko: '전송되었습니다. 곧 누군가 찾아갈 거예요.',
    vi: 'Đã gửi. Sẽ có người đến với bạn ngay.',
    pl: 'Wysłano. Ktoś wkrótce do Ciebie przyjdzie.',
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
    tl: 'Naabisuhan ko na ang iyong nars.',
    ht: 'Mwen avèti enfimyè ou a.',
    ar: 'لقد أبلغت ممرضتك.',
    ko: '담당 간호사에게 알렸습니다.',
    vi: 'Tôi đã báo cho y tá của bạn.',
    pl: 'Twoja pielęgniarka została powiadomiona.',
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
    tl: 'Sige. Ano ang kailangan mo?',
    ht: 'Dakò. Kisa ou bezwen?',
    ar: 'حسنًا. ماذا تحتاج؟',
    ko: '알겠습니다. 무엇이 필요하세요?',
    vi: 'Vâng. Bạn cần gì?',
    pl: 'Dobrze. Czego potrzebujesz?',
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
    tl: `Paumanhin, hindi ko iyon naipadala. Kung kailangan mo ng tulong, pindutin ang ${helpButton('tl')}.`,
    ht: `Padon, mwen pa t kapab voye sa. Si ou bezwen èd, peze ${helpButton('ht')}.`,
    ar: `عذرًا، لم أتمكن من إرسال ذلك. إذا كنت بحاجة إلى مساعدة، فاضغط على ${helpButton('ar')}.`,
    ko: `죄송합니다. 전송하지 못했습니다. 도움이 필요하시면 ${helpButton('ko')} 버튼을 누르세요.`,
    vi: `Xin lỗi, tôi không gửi được. Nếu bạn cần giúp đỡ, hãy nhấn ${helpButton('vi')}.`,
    pl: `Przepraszamy, nie udało się tego wysłać. Jeśli potrzebujesz pomocy, naciśnij ${helpButton('pl')}.`,
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
    tl: 'Nakikinig ako. Sabihin mo sa amin kung ano ang nangyayari, kung kaya mo.',
    ht: "M'ap koute. Di nou sa k ap pase, si ou kapab.",
    ar: 'أنا أستمع. أخبرنا بما يحدث، إن استطعت.',
    ko: '듣고 있어요. 가능하시면 무슨 일인지 말씀해 주세요.',
    vi: 'Tôi đang nghe. Nếu có thể, hãy cho chúng tôi biết chuyện gì đang xảy ra.',
    pl: 'Słucham. Powiedz nam, co się dzieje, jeśli możesz.',
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
    tl: 'Salamat. Papunta na ang iyong nars.',
    ht: 'Mèsi. Enfimyè ou a ap vini.',
    ar: 'شكرًا لك. ممرضتك في الطريق.',
    ko: '감사합니다. 간호사가 가고 있어요.',
    vi: 'Cảm ơn bạn. Y tá đang đến.',
    pl: 'Dziękujemy. Pielęgniarka jest już w drodze.',
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
    tl: 'Sige, kinansela ko na iyon.',
    ht: 'Dakò, mwen anile sa.',
    ar: 'حسنًا، لقد ألغيت ذلك.',
    ko: '네, 취소했습니다.',
    vi: 'Vâng, tôi đã hủy yêu cầu đó.',
    pl: 'Dobrze, anulowano.',
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
    tl: 'Sandali lang.',
    ht: 'Yon ti moman.',
    ar: 'لحظة من فضلك.',
    ko: '잠시만요.',
    vi: 'Xin chờ một chút.',
    pl: 'Chwileczkę.',
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
