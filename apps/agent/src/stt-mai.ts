// Microsoft MAI-Transcribe-2 through the Vercel AI Gateway: the backup transcriber (Scribe is
// the main one; see stt.ts). It gives the live partials, and the final when Scribe can't.
//
// What the gateway's MAI streaming model does (measured, and per the AI SDK docs): it never
// detects pauses on its own and only commits a final transcript when the input audio stream
// ends; it reports no detected language; and in testing about half of its sessions failed with
// `service_unavailable_error` roughly 7 s after the commit, with no partials. The non-streaming
// `microsoft/mai-transcribe-2` was 19/19 reliable in 0.3-1.2 s and reports the language.
import { createGateway } from '@ai-sdk/gateway'
import {
  experimental_streamTranscribe as streamTranscribe,
  type TranscriptionStreamPart,
  transcribe,
} from 'ai'
import { boardLanguage } from './languages'

export const MAI_STREAMING_MODEL = 'microsoft/mai-transcribe-2-streaming'
export const MAI_BATCH_MODEL = 'microsoft/mai-transcribe-2'
export const MAI_SAMPLE_RATE = 16_000

/**
 * One batch attempt's timeout. The batch model answers in 0.3-1.2 s. Attempts never retry inside
 * the AI SDK (maxRetries 0): its 2 s / 4 s backoff used to run into our timeout and fail the
 * utterance with "Delay was aborted" before the retry ever happened.
 */
const BATCH_ATTEMPT_TIMEOUT_MS = 3000
/** After every attempt failed: wait this long, then one last attempt (bounded by the timeout). */
const LAST_RETRY_BACKOFF_MS = 250
/** How long to wait for the streaming final when the batch call failed or found no words. */
const STREAM_FINAL_GRACE_MS = 1500

/** The two MAI calls, injectable for tests. Neither may be given more than one utterance. */
export interface MaiTranscribers {
  /** Live transcription of one utterance; the audio stream closing commits it. */
  stream(input: {
    audio: ReadableStream<Uint8Array>
    language?: string
    abortSignal: AbortSignal
  }): AsyncIterable<TranscriptionStreamPart>
  /** Transcription of one whole utterance (16 kHz mono WAV). */
  batch(input: {
    wav: Uint8Array
    language?: string
    abortSignal: AbortSignal
  }): Promise<{ text: string; language?: string }>
}

export function gatewayTranscribers(apiKey: string): MaiTranscribers {
  const gateway = createGateway({ apiKey })
  return {
    stream: ({ audio, language, abortSignal }) =>
      streamTranscribe({
        model: gateway.transcriptionModel(MAI_STREAMING_MODEL),
        audio,
        inputAudioFormat: { type: 'audio/pcm', rate: MAI_SAMPLE_RATE },
        abortSignal,
        ...(language ? { providerOptions: { azure: { language } } } : {}),
      }).fullStream,
    batch: async ({ wav, language, abortSignal }) => {
      const result = await transcribe({
        model: gateway.transcriptionModel(MAI_BATCH_MODEL),
        audio: wav,
        abortSignal,
        // retries are ours (MaiBackup), with fresh timeouts and logging
        maxRetries: 0,
        ...(language ? { providerOptions: { azure: { locales: [language] } } } : {}),
      })
      return { text: result.text, language: detectedLanguage(result) }
    },
  }
}

/** Room-language codes MAI takes under another name ("tl" and "no" are 400s; checked). */
const MAI_ALIASES: Readonly<Record<string, string>> = { tl: 'fil', no: 'nb' }

/**
 * Locale hints MAI accepted, each checked with a real call against mai-transcribe-2. A room
 * language outside this set (e.g. after the language list changes) is simply auto-detected.
 */
const MAI_HINTS: ReadonlySet<string> = new Set(
  (
    'en es zh pt hi gu ko ar pl af hy as az bn bs bg yue ca cs da nl et fi fr gl de el he hu is ' +
    'id it ja kn kk lv lt mk ms ml mr ne or fa pa ro ru sk sl sw sv ta te th tr uk ur vi fil nb ' +
    'hr sr cy'
  ).split(' '),
)

/** The hint MAI accepts for a room language, or undefined (auto-detect). */
export function maiLanguageHint(language: string): string | undefined {
  if (language === 'auto') return undefined
  const code = MAI_ALIASES[language] ?? language
  return MAI_HINTS.has(code) ? code : undefined
}

/**
 * MAI's language for a batch result: `language` when the phrase locales agree on one ISO-639-1
 * code, else the first phrase locale (e.g. "fil", which has no ISO-639-1 code).
 */
function detectedLanguage(result: {
  language?: string | undefined
  providerMetadata?: Record<string, unknown> | undefined
}): string | undefined {
  if (result.language) return boardLanguage(result.language)
  const azure = result.providerMetadata?.azure
  const phrases =
    typeof azure === 'object' && azure !== null && 'phrases' in azure ? azure.phrases : undefined
  if (!Array.isArray(phrases)) return undefined
  for (const phrase of phrases) {
    if (typeof phrase === 'object' && phrase !== null && 'locale' in phrase) {
      if (typeof phrase.locale === 'string' && phrase.locale) return boardLanguage(phrase.locale)
    }
  }
  return undefined
}

/** 16 kHz mono 16-bit PCM wrapped in a WAV header. */
export function pcmToWav(pcm: Int16Array, sampleRate = MAI_SAMPLE_RATE): Uint8Array {
  const dataBytes = pcm.length * 2
  const out = new Uint8Array(44 + dataBytes)
  const view = new DataView(out.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)
  out.set(new Uint8Array(pcm.buffer, pcm.byteOffset, dataBytes), 44)
  return out
}

export interface SttLogger {
  debug(fields: Record<string, unknown>, message: string): void
  info(fields: Record<string, unknown>, message: string): void
  warn(fields: Record<string, unknown>, message: string): void
}

/** A final transcript from one of the MAI calls. */
export interface MaiCandidate {
  source: 'stream' | 'batch' | 'speculative' | 'retry'
  text: string
  /** Only the batch model reports one. */
  language: string | undefined
}

/** A MAI result: a transcript, nothing (no words), or an error (every attempt failed). */
export interface MaiOutcome {
  candidate: MaiCandidate | undefined
  error: unknown
}

/** HTTP status and kind of a failed call, for the logs (no request data). */
export function failureInfo(error: unknown): Record<string, unknown> {
  const fields = error as { statusCode?: unknown; isRetryable?: unknown; name?: unknown }
  return {
    status: typeof fields?.statusCode === 'number' ? fields.statusCode : undefined,
    retryable: typeof fields?.isRetryable === 'boolean' ? fields.isRetryable : undefined,
    error: describeError(error),
  }
}

/**
 * MAI for one session: the live session per utterance (partials), and the final when Scribe
 * can't give one. Never rejects; every batch attempt is logged.
 */
export class MaiBackup {
  readonly #transcribers: MaiTranscribers
  readonly #language: string | undefined
  readonly #log: SttLogger

  constructor(options: { transcribers: MaiTranscribers; language?: string; logger: SttLogger }) {
    this.#transcribers = options.transcribers
    this.#language = options.language
    this.#log = options.logger
  }

  /**
   * Live transcription of one utterance: partials go to `onPartial` once `before` resolved (the
   * previous utterance's events are out). Resolves to the streaming final, or undefined if the
   * session failed. The session is opened right away; closing `audio` commits it.
   */
  async live(input: {
    audio: ReadableStream<Uint8Array>
    abortSignal: AbortSignal
    before: Promise<void>
    onPartial: (text: string) => void
  }): Promise<string | undefined> {
    let confirmed = ''
    let final: string | undefined
    try {
      const parts = this.#transcribers.stream({
        audio: input.audio,
        language: this.#language,
        abortSignal: input.abortSignal,
      })
      await input.before
      for await (const part of parts) {
        if (part.type === 'transcript-delta') {
          confirmed += part.delta
        } else if (part.type === 'transcript-partial') {
          input.onPartial(`${confirmed}${part.text}`)
        } else if (part.type === 'transcript-final') {
          final = `${final ?? ''}${final ? ' ' : ''}${part.text}`.trim()
        } else if (part.type === 'error') {
          throw part.error
        }
      }
    } catch (error) {
      if (!input.abortSignal.aborted) {
        this.#log.debug({ error: describeError(error) }, 'MAI streaming session failed')
      }
      return undefined
    }
    return final || undefined
  }

  /**
   * MAI's final for one utterance: the streaming final if it is already in (no batch call),
   * else whichever valid, non-empty transcript arrives first, a batch call or the streaming
   * final. The batch call is `speculative` if given and still valid (a failed one is followed by
   * a fresh call on all the audio), else a fresh one. A failed or empty batch call waits
   * STREAM_FINAL_GRACE_MS for the stream; a failed stream never blocks the batch. If every
   * attempt failed, one last batch attempt unless `skipRetry()` says the final was decided.
   */
  async final(input: {
    speech: Int16Array
    streamed: Promise<string | undefined>
    streamedText: string | undefined
    speculative: Promise<MaiOutcome> | undefined
    skipRetry: () => boolean
  }): Promise<MaiOutcome> {
    if (input.streamedText) {
      return {
        candidate: { source: 'stream', text: input.streamedText, language: undefined },
        error: undefined,
      }
    }
    const { speech, speculative } = input
    const batch: Promise<MaiOutcome> = speculative
      ? speculative.then((outcome) =>
          outcome.error === undefined ? outcome : this.batch(speech, 'batch', 2),
        )
      : this.batch(speech, 'batch', 1)
    const stream: Promise<MaiCandidate | undefined> = input.streamed.then((text) =>
      text ? { source: 'stream', text, language: undefined } : undefined,
    )
    const graceForStream = () => withTimeout(stream, STREAM_FINAL_GRACE_MS)
    const winner = await Promise.race([
      batch.then((outcome) => outcome.candidate ?? graceForStream()),
      stream.then((candidate) => candidate ?? batch.then((outcome) => outcome.candidate)),
    ])
    if (winner) return { candidate: winner, error: undefined }

    const { error } = await batch
    if (error === undefined) return { candidate: undefined, error: undefined }
    // Every attempt failed (often the gateway, briefly): one last try with a fresh controller.
    await new Promise((resolve) => setTimeout(resolve, LAST_RETRY_BACKOFF_MS))
    if (input.skipRetry()) return { candidate: undefined, error }
    const last = await this.batch(speech, 'retry', 3)
    if (last.candidate || last.error === undefined) return last
    return { candidate: undefined, error: last.error }
  }

  /**
   * One batch attempt with its own timeout (and `cancel` for a speculative call). Never rejects.
   * Every attempt is logged with its HTTP status on failure.
   */
  async batch(
    speech: Int16Array,
    source: 'batch' | 'speculative' | 'retry',
    attempt: number,
    cancel?: AbortSignal,
  ): Promise<MaiOutcome> {
    const started = performance.now()
    const timeout = AbortSignal.timeout(BATCH_ATTEMPT_TIMEOUT_MS)
    try {
      const result = await this.#transcribers.batch({
        wav: pcmToWav(speech),
        language: this.#language,
        abortSignal: cancel ? AbortSignal.any([cancel, timeout]) : timeout,
      })
      const text = result.text.trim()
      this.#log.debug(
        { source, attempt, ms: Math.round(performance.now() - started), empty: !text },
        'MAI batch attempt',
      )
      // Empty: noise or a cough, not words.
      return {
        candidate: text ? { source, text, language: result.language } : undefined,
        error: undefined,
      }
    } catch (error) {
      if (cancel?.aborted) return { candidate: undefined, error: undefined } // speech resumed
      this.#log.warn(
        {
          source,
          attempt,
          ms: Math.round(performance.now() - started),
          timedOut: timeout.aborted,
          ...failureInfo(error),
        },
        'MAI batch attempt failed',
      )
      return { candidate: undefined, error }
    }
  }
}

/** The promise's value, or undefined if it takes longer than `ms`. */
export function withTimeout<T>(
  promise: Promise<T | undefined>,
  ms: number,
): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ])
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'object' && error !== null) {
    // gateway error parts are plain objects; keep it short (they hold no secrets or audio)
    return JSON.stringify(error).slice(0, 200)
  }
  return String(error)
}
