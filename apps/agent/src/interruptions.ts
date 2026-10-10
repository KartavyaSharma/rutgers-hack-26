// When patient speech may interrupt the agent. Background voices and short backchannels in a
// noisy room used to hijack replies, so an agent reply is only interrupted by at least 0.6 s and
// at least 2 words of patient speech.

/** Minimum patient speech, in ms, to interrupt an agent reply. */
export const MIN_INTERRUPTION_MS = 600
/** Minimum words to interrupt (for languages written with spaces; see interruptionWords). */
export const MIN_INTERRUPTION_WORDS = 2

const CJK_LANGUAGES = new Set(['zh', 'ja', 'ko', 'yue'])

/**
 * Words needed to interrupt, for the language being spoken. LiveKit 1.9.2 counts words by
 * whitespace, so a whole Chinese sentence is one "word": a 2-word rule would leave CJK speakers
 * unable to interrupt (and their turn held while the agent talks). For CJK, the 0.6 s minimum
 * duration does the job instead (0.6 s of speech is well over 2 characters).
 */
export function interruptionWords(language: string | null | undefined): number {
  const base = language?.split(/[-_]/)[0]?.toLowerCase()
  return base && CJK_LANGUAGES.has(base) ? 0 : MIN_INTERRUPTION_WORDS
}
