// Patient-facing strings for the tablet and the voice agent: short and casual, the way an aide
// would say them, still respectful. Effect-free: client components import this via
// `@bell/core/messages`. Patient-facing text never names a team.
import { oneLine, replyLanguage, type SupportedLanguage } from './language'
import type { LanguagePreference } from './taxonomy'

export const PATIENT_MESSAGE_KEYS = [
  'listening_intro',
  'sent',
  'nurse_notified',
  'ask_again',
  'say_again',
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
  listening_intro: {
    en: "Go ahead, I'm listening.",
    es: 'Dime, te escucho.',
    zh: '请说，我在听。',
    tl: 'Sige, nakikinig ako.',
    ht: 'Pale, m ap koute w.',
    pt: 'Pode falar, estou ouvindo.',
    ru: 'Говорите, я слушаю.',
    ar: 'تفضل، أنا أسمعك.',
    hi: 'बोलिए, हम सुन रहे हैं।',
    ko: '말씀하세요, 듣고 있어요.',
    vi: 'Bạn cứ nói, tôi đang nghe.',
    pl: 'Śmiało, słucham.',
    fr: 'Allez-y, je vous écoute.',
    de: 'Bitte, ich höre zu.',
    ja: 'どうぞ、聞いています。',
    it: 'Dica pure, la ascolto.',
    nl: 'Zeg het maar, ik luister.',
  },
  sent: {
    en: "Sent. Someone's coming.",
    es: 'Enviado. Ya viene alguien.',
    zh: '已发送，马上有人来。',
    tl: 'Naipadala na. May darating na.',
    ht: 'Li voye. Gen yon moun k ap vini.',
    pt: 'Enviado. Já vem alguém.',
    ru: 'Отправлено. Сейчас подойдут.',
    ar: 'تم الإرسال. أحدهم في الطريق.',
    hi: 'भेज दिया। कोई आ रहा है।',
    ko: '보냈어요. 곧 누가 올 거예요.',
    vi: 'Đã gửi. Có người đang tới.',
    pl: 'Wysłane. Ktoś zaraz przyjdzie.',
    fr: "Envoyé. Quelqu'un arrive.",
    de: 'Gesendet. Gleich kommt jemand.',
    ja: '送りました。すぐに来ます。',
    it: 'Inviato. Arriva qualcuno.',
    nl: 'Verstuurd. Er komt iemand aan.',
  },
  nurse_notified: {
    en: 'Your nurse is on the way.',
    es: 'Tu enfermera ya viene.',
    zh: '护士马上就来。',
    tl: 'Papunta na ang nars mo.',
    ht: 'Enfimyè w la ap vini.',
    pt: 'Sua enfermeira já está a caminho.',
    ru: 'Медсестра уже идёт.',
    ar: 'ممرضتك في الطريق.',
    hi: 'आपकी नर्स आ रही है।',
    ko: '간호사가 오고 있어요.',
    vi: 'Y tá đang tới.',
    pl: 'Pielęgniarka już idzie.',
    fr: 'Votre infirmière arrive.',
    de: 'Ihre Pflegekraft ist unterwegs.',
    ja: '看護師が向かっています。',
    it: "L'infermiere sta arrivando.",
    nl: 'Uw verpleegkundige komt eraan.',
  },
  ask_again: {
    en: 'Okay. What do you need?',
    es: 'Claro. ¿Qué necesitas?',
    zh: '好的，您需要什么？',
    tl: 'Sige. Ano ang kailangan mo?',
    ht: 'Dakò. Kisa w bezwen?',
    pt: 'Certo. Do que você precisa?',
    ru: 'Хорошо. Что вам нужно?',
    ar: 'حسنًا، ماذا تحتاج؟',
    hi: 'ठीक है। क्या चाहिए?',
    ko: '네. 뭐가 필요하세요?',
    vi: 'Vâng. Bạn cần gì?',
    pl: 'Dobrze. Czego potrzebujesz?',
    fr: "D'accord. Qu'est-ce qu'il vous faut ?",
    de: 'Okay. Was brauchen Sie?',
    ja: 'はい。何が必要ですか？',
    it: 'Va bene. Di cosa ha bisogno?',
    nl: 'Oké. Wat heeft u nodig?',
  },
  // The voice agent heard speech but could not transcribe it (speech-to-text failed).
  say_again: {
    en: 'Sorry, say that again?',
    es: 'Perdona, ¿me lo repites?',
    zh: '不好意思，请再说一遍？',
    tl: 'Pasensya, pakiulit?',
    ht: 'Eskize m, repete sa?',
    pt: 'Desculpe, pode repetir?',
    ru: 'Извините, повторите?',
    ar: 'عذرًا، هل يمكنك التكرار؟',
    hi: 'माफ़ कीजिए, फिर से कहिए?',
    ko: '죄송해요, 다시 말씀해 주세요.',
    vi: 'Xin lỗi, bạn nói lại được không?',
    pl: 'Przepraszam, możesz powtórzyć?',
    fr: 'Pardon, vous pouvez répéter ?',
    de: 'Entschuldigung, noch einmal bitte?',
    ja: 'すみません、もう一度お願いします。',
    it: 'Scusi, può ripetere?',
    nl: 'Sorry, kunt u dat herhalen?',
  },
  save_failed: {
    en: `Couldn't send that. Press ${helpButton('en')}.`,
    es: `No se pudo enviar. Pulsa ${helpButton('es')}.`,
    zh: `发送失败。请按${helpButton('zh')}。`,
    tl: `Hindi naipadala. Pindutin ang ${helpButton('tl')}.`,
    ht: `Li pa t voye. Peze ${helpButton('ht')}.`,
    pt: `Não deu para enviar. Toque em ${helpButton('pt')}.`,
    ru: `Не удалось отправить. Нажмите ${helpButton('ru')}.`,
    ar: `تعذّر الإرسال. اضغط على ${helpButton('ar')}.`,
    hi: `भेजा नहीं जा सका। ${helpButton('hi')} दबाएँ।`,
    ko: `보내지 못했어요. ${helpButton('ko')} 버튼을 누르세요.`,
    vi: `Không gửi được. Hãy nhấn ${helpButton('vi')}.`,
    pl: `Nie udało się wysłać. Naciśnij ${helpButton('pl')}.`,
    fr: `Envoi impossible. Appuyez sur ${helpButton('fr')}.`,
    de: `Senden hat nicht geklappt. Drücken Sie ${helpButton('de')}.`,
    ja: `送信できませんでした。${helpButton('ja')}を押してください。`,
    it: `Invio non riuscito. Prema ${helpButton('it')}.`,
    nl: `Versturen lukte niet. Druk op ${helpButton('nl')}.`,
  },
  emergency_listening: {
    en: "I'm here. What's wrong?",
    es: 'Aquí estoy. ¿Qué pasa?',
    zh: '我在。怎么了？',
    tl: 'Nandito ako. Ano ang nangyari?',
    ht: 'M la. Sa k pase?',
    pt: 'Estou aqui. O que houve?',
    ru: 'Я здесь. Что случилось?',
    ar: 'أنا هنا. ما المشكلة؟',
    hi: 'हम यहाँ हैं। क्या हुआ?',
    ko: '여기 있어요. 무슨 일이에요?',
    vi: 'Tôi đây. Có chuyện gì vậy?',
    pl: 'Jestem tutaj. Co się stało?',
    fr: 'Je suis là. Que se passe-t-il ?',
    de: 'Ich bin da. Was ist los?',
    ja: 'ここにいます。どうしましたか？',
    it: 'Sono qui. Cosa succede?',
    nl: 'Ik ben er. Wat is er aan de hand?',
  },
  emergency_noted: {
    en: "Got it. Help's coming.",
    es: 'Entendido. Ya viene ayuda.',
    zh: '知道了，马上有人来帮您。',
    tl: 'Sige. Parating na ang tulong.',
    ht: 'Dakò. Èd ap vini.',
    pt: 'Entendi. A ajuda já vem.',
    ru: 'Понятно. Помощь уже идёт.',
    ar: 'فهمت. المساعدة في الطريق.',
    hi: 'समझ गए। मदद आ रही है।',
    ko: '알겠어요. 곧 도와드릴게요.',
    vi: 'Tôi hiểu rồi. Đang có người tới giúp.',
    pl: 'Rozumiem. Pomoc już idzie.',
    fr: "Compris. De l'aide arrive.",
    de: 'Verstanden. Hilfe ist unterwegs.',
    ja: 'わかりました。すぐに助けが来ます。',
    it: 'Capito. Sta arrivando qualcuno.',
    nl: 'Begrepen. Er komt hulp aan.',
  },
  cancelled: {
    en: 'Okay, cancelled.',
    es: 'Listo, cancelado.',
    zh: '好的，已取消。',
    tl: 'Sige, kinansela na.',
    ht: 'Dakò, li anile.',
    pt: 'Certo, cancelado.',
    ru: 'Хорошо, отменено.',
    ar: 'حسنًا، تم الإلغاء.',
    hi: 'ठीक है, रद्द कर दिया।',
    ko: '네, 취소했어요.',
    vi: 'Vâng, đã hủy.',
    pl: 'Dobrze, anulowane.',
    fr: "D'accord, c'est annulé.",
    de: 'Okay, abgesagt.',
    ja: 'はい、取り消しました。',
    it: 'Va bene, annullato.',
    nl: 'Oké, geannuleerd.',
  },
  one_moment: {
    en: 'One sec.',
    es: 'Un segundo.',
    zh: '稍等。',
    tl: 'Saglit lang.',
    ht: 'Yon segonn.',
    pt: 'Só um segundo.',
    ru: 'Секунду.',
    ar: 'لحظة.',
    hi: 'एक सेकंड।',
    ko: '잠깐만요.',
    vi: 'Chờ chút nhé.',
    pl: 'Chwileczkę.',
    fr: 'Une seconde.',
    de: 'Einen Moment.',
    ja: '少しお待ちください。',
    it: 'Un attimo.',
    nl: 'Momentje.',
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
