// Patient words in another language -> plain English for the nurse, through the same Vercel AI
// Gateway and Qwen model the voice agent uses. Best effort: without a key, or when the call fails
// or is slow, the ticket keeps the patient's own words and says it is not translated.

import { canonicalLanguage, guessLanguage } from '@bell/core'
import { LANGUAGES } from '@bell/core/taxonomy'

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1'
const DEFAULT_MODEL = 'alibaba/qwen3.8-27b'
const TIMEOUT_MS = 6000

const SYSTEM = [
  "Translate a hospital patient's message into plain, natural English for their nurse.",
  'Keep the meaning, tone and any numbers exactly. Do not add or explain anything.',
  'Reply with the English translation only, no quotes.',
].join(' ')

const read = (name: string): string | undefined => process.env[name]?.trim() || undefined

/**
 * The patient's language for this text. A non-Latin script (Chinese, Arabic, Hindi...) is a
 * reliable signal, so it wins; otherwise the router's code, else a guess from common words.
 */
export const languageOf = (text: string, routerLanguage: string | null): string | null => {
  const guess = guessLanguage(text)
  if (guess && /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(text)) return guess
  return (routerLanguage ? canonicalLanguage(routerLanguage) : null) ?? guess
}

/** "zh" -> "Chinese". */
export const languageName = (code: string): string =>
  LANGUAGES.find((l) => l.code === code)?.label ?? code

/** English for the nurse, or null when it could not be translated. */
export const translateToEnglish = async (
  text: string,
  language: string,
): Promise<string | null> => {
  const apiKey = read('AI_GATEWAY_API_KEY')
  if (!apiKey) return null
  try {
    const res = await fetch(`${read('AI_GATEWAY_BASE_URL') ?? GATEWAY_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: read('GATEWAY_AGENT_MODEL') ?? DEFAULT_MODEL,
        temperature: 0,
        max_tokens: 300,
        reasoning: { effort: 'none' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Language: ${languageName(language)}\nMessage: ${text}` },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`gateway HTTP ${res.status}`)
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const english = (body.choices?.[0]?.message?.content ?? '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/^["“'](.*)["”']$/s, '$1')
      .trim()
    return english || null
  } catch (error) {
    console.error('[staff] translation failed', error instanceof Error ? error.message : error)
    return null
  }
}
