// Which room-language codes each speech provider accepts. Each set was checked with real calls;
// a code outside it (e.g. after the language list changes) is left out and the provider
// auto-detects or follows the text. MAI's hints live with the MAI adapter (stt-mai.ts).

/** Room-language codes ElevenLabs takes under another name ("tl" is a 400; checked). */
const ELEVEN_ALIASES: Readonly<Record<string, string>> = { tl: 'fil' }

/**
 * language_code values eleven_v4_turbo accepted, each checked with a real call. A room language
 * outside this set gets no code, and ElevenLabs follows the text.
 */
const ELEVEN_V4_LANGUAGES: ReadonlySet<string> = new Set(
  (
    'en es zh pt hi gu ko ar pl af hy as az bn bs bg yue ca cs da nl et fi fr gl de el he hu ' +
    'is id it ja kn kk lv lt mk ms ml mr ne no or fa pa ro ru sk sl sw sv ta te th tr uk ur vi fil'
  ).split(' '),
)

/** The ElevenLabs language code for a room language, or undefined to follow the text. */
export function elevenLabsLanguage(language: string): string | undefined {
  if (language === 'auto') return undefined
  const code = ELEVEN_ALIASES[language] ?? language
  return ELEVEN_V4_LANGUAGES.has(code) ? code : undefined
}
