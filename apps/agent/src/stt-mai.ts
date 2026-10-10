// Microsoft MAI-Transcribe-2 through the Vercel AI Gateway, as a LiveKit STT.
//
// What the gateway's MAI streaming model does (measured, and per the AI SDK docs): it never
// detects pauses on its own and only commits a final transcript when the input audio stream
// ends; it reports no detected language; and in testing about half of its sessions failed with
// `service_unavailable_error` roughly 7 s after the commit, with no partials. The non-streaming
// `microsoft/mai-transcribe-2` was 19/19 reliable in 0.3-1.2 s and reports the language.
//
// So each utterance is cut out by a local VAD (the bundled silero), and:
// - streamed to `mai-transcribe-2-streaming` for live partials (INTERIM_TRANSCRIPT), and
// - sent whole to `mai-transcribe-2` at end of speech for the FINAL_TRANSCRIPT and its language.
// If the batch call fails, the streaming final is used when it arrived. Events per utterance:
// START_OF_SPEECH (first partial, or just before the final), INTERIM_TRANSCRIPT*,
// FINAL_TRANSCRIPT, END_OF_SPEECH. With turnDetection 'stt' that END closes the user's turn.
import { createGateway } from '@ai-sdk/gateway'
import { canonicalLanguage, guessLanguage } from '@bell/core'
import {
  APIConnectionError,
  type APIConnectOptions,
  DEFAULT_API_CONNECT_OPTIONS,
  inference,
  type LanguageCode,
  log,
  normalizeLanguage,
  stt,
  VADEventType,
} from '@livekit/agents'
import type { AudioFrame } from '@livekit/rtc-node'
import {
  experimental_streamTranscribe as streamTranscribe,
  type TranscriptionStreamPart,
  transcribe,
} from 'ai'

export const MAI_STREAMING_MODEL = 'microsoft/mai-transcribe-2-streaming'
export const MAI_BATCH_MODEL = 'microsoft/mai-transcribe-2'
export const MAI_SAMPLE_RATE = 16_000

/** Silence that ends an utterance. Also the main part of the end-of-turn delay. */
export const DEFAULT_MAI_SILENCE_MS = 600
const BATCH_TIMEOUT_MS = 5000
/** How long to wait for the streaming final when the batch call failed or found no words. */
const STREAM_FINAL_GRACE_MS = 1500
/** Silence after which the batch call starts speculatively, before the utterance is committed. */
export const SPECULATE_AFTER_MS = 250
/** Utterances in a row with no transcript at all before the stream reports a connection error. */
const MAX_CONSECUTIVE_FAILURES = 3

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
        ...(language ? { providerOptions: { azure: { locales: [language] } } } : {}),
      })
      return { text: result.text, language: detectedLanguage(result) }
    },
  }
}

/**
 * The hint MAI accepts for a room language, or undefined (auto-detect). MAI calls Tagalog
 * "fil" and rejects "tl" with a 400; it has no Haitian Creole, and "ht" is also a 400.
 */
export function maiLanguageHint(language: string): string | undefined {
  if (language === 'auto') return undefined
  if (language === 'tl') return 'fil'
  if (language === 'ht') return undefined
  return language
}

/** The board's code for a language MAI reports ("fil" is the board's "tl"). */
export function boardLanguage(language: string | undefined): string | undefined {
  if (!language) return undefined
  const base = language.split(/[-_]/)[0]?.toLowerCase()
  return base === 'fil' ? 'tl' : base
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

export interface MaiSegmenterLogger {
  debug(fields: Record<string, unknown>, message: string): void
  info(fields: Record<string, unknown>, message: string): void
  warn(fields: Record<string, unknown>, message: string): void
}

export interface MaiSegmenterOptions {
  transcribers: MaiTranscribers
  emit: (event: stt.SpeechEvent) => void
  /** MAI language hint (see maiLanguageHint); undefined to auto-detect. */
  language?: string
  /** The room's language (board code), the starting point for sticky language; undefined for auto. */
  roomLanguage?: string
  logger?: MaiSegmenterLogger
  /** Called after MAX_CONSECUTIVE_FAILURES utterances in a row produced no transcript at all. */
  onRepeatedFailure?: (error: Error) => void
}

interface Utterance {
  controller: ReadableStreamDefaultController<Uint8Array> | undefined
  /** Copies of all audio so far (pre-roll + live), for the batch call. */
  chunks: Int16Array[]
  abort: AbortController
  /** START_OF_SPEECH was emitted. */
  started: boolean
  /** The FINAL/END pair was emitted; later partials are ignored. */
  done: boolean
  /** The streaming final, or undefined if the session failed. */
  streamedFinal: Promise<string | undefined>
  /** A batch call started during a pause, before the commit; dropped if speech resumes. */
  speculative: { abort: AbortController; result: Promise<BatchOutcome> } | undefined
  /** When the first final candidate was asked for (commit), for logging. */
  committedAt: number
}

/** A final transcript from one of the two MAI calls. */
interface Candidate {
  source: 'batch' | 'speculative' | 'stream'
  text: string
  /** Only the batch model reports one. */
  language: string | undefined
}

/** A batch call's result: a transcript, nothing (no words), or an error. */
interface BatchOutcome {
  candidate: Candidate | undefined
  error: unknown
}

const NOOP_LOGGER: MaiSegmenterLogger = { debug() {}, info() {}, warn() {} }

/**
 * Turns VAD-cut utterances into LiveKit speech events using the two MAI calls. No LiveKit runtime
 * needed, so it is unit-testable. Events of one utterance are never interleaved with the next.
 */
export class MaiSegmenter {
  readonly #transcribers: MaiTranscribers
  readonly #emit: (event: stt.SpeechEvent) => void
  readonly #language: string | undefined
  readonly #log: MaiSegmenterLogger
  readonly #onRepeatedFailure: ((error: Error) => void) | undefined
  #current: Utterance | undefined
  /** Resolves when everything emitted so far is out; each utterance chains onto it. */
  #tail: Promise<void> = Promise.resolve()
  #failures = 0
  #closed = false
  /** The session's last confident language (board code). */
  #lastLanguage: string | undefined

  constructor(options: MaiSegmenterOptions) {
    this.#transcribers = options.transcribers
    this.#emit = options.emit
    this.#language = options.language
    this.#lastLanguage = options.roomLanguage
    this.#log = options.logger ?? NOOP_LOGGER
    this.#onRepeatedFailure = options.onRepeatedFailure
  }

  /** Speech started; `preroll` is the audio the VAD already holds for it. */
  start(preroll: readonly Int16Array[]): void {
    if (this.#closed) return
    if (this.#current) closeAudio(this.#current)
    const abort = new AbortController()
    const utterance: Utterance = {
      controller: undefined,
      chunks: [],
      abort,
      started: false,
      done: false,
      streamedFinal: Promise.resolve(undefined),
      speculative: undefined,
      committedAt: 0,
    }
    const audio = new ReadableStream<Uint8Array>({
      start: (controller) => {
        utterance.controller = controller
      },
      // A failed session cancels its audio; keep recording the utterance for the batch call.
      cancel: () => {
        utterance.controller = undefined
      },
    })
    for (const pcm of preroll) this.#push(utterance, pcm)
    utterance.streamedFinal = this.#consume(utterance, audio, this.#tail)
    this.#current = utterance
  }

  /** More audio for the current utterance. */
  audio(pcm: Int16Array): void {
    if (this.#current) this.#push(this.#current, pcm)
  }

  /**
   * A pause long enough to guess the utterance may be over: start the batch call on the audio so
   * far, in parallel with the rest of the silence wait. No-op if one is already running.
   */
  speculate(): void {
    const utterance = this.#current
    if (!utterance || utterance.speculative || this.#closed) return
    const abort = new AbortController()
    utterance.speculative = {
      abort,
      result: this.#batch(concat(utterance.chunks), 'speculative', abort.signal),
    }
  }

  /** Speech resumed after a pause: the speculative call no longer covers the utterance. */
  resumed(): void {
    const speculative = this.#current?.speculative
    if (!speculative || !this.#current) return
    speculative.abort.abort()
    this.#current.speculative = undefined
  }

  /**
   * Speech ended. Resolves once the utterance's FINAL and END events are out (or skipped, for an
   * utterance with no words).
   */
  end(): Promise<void> {
    const utterance = this.#current
    this.#current = undefined
    if (!utterance || this.#closed) return Promise.resolve()
    closeAudio(utterance) // commits the streaming session
    utterance.committedAt = performance.now()
    const result = this.#resolveFinal(utterance)
    const emitted = this.#tail.then(async () => {
      const final = await result
      if (this.#closed) return
      utterance.done = true
      if (final) {
        if (!utterance.started) {
          utterance.started = true
          this.#emit({ type: stt.SpeechEventType.START_OF_SPEECH })
        }
        const data = speechData(final.text, final.language)
        this.#emit({ type: stt.SpeechEventType.FINAL_TRANSCRIPT, alternatives: [data] })
        this.#emit({ type: stt.SpeechEventType.END_OF_SPEECH, alternatives: [data] })
      } else if (utterance.started) {
        this.#emit({ type: stt.SpeechEventType.END_OF_SPEECH })
      }
      // The streaming session has done its job either way; a failing one would linger ~7 s.
      utterance.abort.abort()
    })
    this.#tail = emitted.catch(() => {})
    return emitted
  }

  /** Waits for queued events. An utterance cut off by the end of input gets no final. */
  async drain(): Promise<void> {
    const current = this.#current
    this.#current = undefined
    if (current) {
      current.done = true
      closeAudio(current)
      current.abort.abort()
      current.speculative?.abort.abort()
    }
    await this.#tail
  }

  /** Copies the audio (callers may reuse their buffers) and feeds the streaming session. */
  #push(utterance: Utterance, pcm: Int16Array): void {
    const copy = pcm.slice()
    utterance.chunks.push(copy)
    try {
      utterance.controller?.enqueue(new Uint8Array(copy.buffer, copy.byteOffset, copy.byteLength))
    } catch {
      // the session's audio stream is already closed or cancelled
      utterance.controller = undefined
    }
  }

  close(): void {
    this.#closed = true
    if (this.#current) closeAudio(this.#current)
    this.#current?.abort.abort()
    this.#current?.speculative?.abort.abort()
    this.#current = undefined
  }

  /** Reads the streaming session: partials become interim transcripts. Never rejects. */
  async #consume(
    utterance: Utterance,
    audio: ReadableStream<Uint8Array>,
    previous: Promise<void>,
  ): Promise<string | undefined> {
    let confirmed = ''
    let final: string | undefined
    try {
      const parts = this.#transcribers.stream({
        audio,
        language: this.#language,
        abortSignal: utterance.abort.signal,
      })
      // The previous utterance's FINAL/END must go out before this one's first event.
      await previous
      for await (const part of parts) {
        if (part.type === 'transcript-delta') {
          confirmed += part.delta
        } else if (part.type === 'transcript-partial') {
          this.#interim(utterance, `${confirmed}${part.text}`)
        } else if (part.type === 'transcript-final') {
          final = `${final ?? ''}${final ? ' ' : ''}${part.text}`.trim()
        } else if (part.type === 'error') {
          throw part.error
        }
      }
    } catch (error) {
      if (!utterance.abort.signal.aborted) {
        this.#log.debug({ error: describeError(error) }, 'MAI streaming session failed')
      }
      return undefined
    }
    return final || undefined
  }

  #interim(utterance: Utterance, text: string): void {
    const trimmed = text.trim()
    if (!trimmed || utterance.done || this.#closed) return
    if (!utterance.started) {
      utterance.started = true
      this.#emit({ type: stt.SpeechEventType.START_OF_SPEECH })
    }
    this.#emit({
      type: stt.SpeechEventType.INTERIM_TRANSCRIPT,
      alternatives: [speechData(trimmed, undefined)],
    })
  }

  /**
   * The utterance's final: whichever valid, non-empty transcript arrives first, the batch call
   * (speculative if it is still valid, else a fresh one) or the streaming final. A failed or empty
   * batch call waits STREAM_FINAL_GRACE_MS for the stream; a failed stream never blocks the batch.
   */
  async #resolveFinal(
    utterance: Utterance,
  ): Promise<{ text: string; language: string | undefined } | undefined> {
    const batch = utterance.speculative?.result ?? this.#batch(concat(utterance.chunks), 'batch')
    const stream: Promise<Candidate | undefined> = utterance.streamedFinal.then((text) =>
      text ? { source: 'stream', text, language: undefined } : undefined,
    )
    const graceForStream = () =>
      Promise.race([
        stream,
        new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), STREAM_FINAL_GRACE_MS),
        ),
      ])
    const winner = await Promise.race([
      batch.then((outcome) => outcome.candidate ?? graceForStream()),
      stream.then((candidate) => candidate ?? batch.then((outcome) => outcome.candidate)),
    ])

    if (!winner) {
      const { error } = await batch
      if (error === undefined) return undefined // no words: noise or a cough
      this.#failures++
      this.#log.warn(
        { error: describeError(error), failures: this.#failures },
        'MAI could not transcribe an utterance',
      )
      if (this.#failures >= MAX_CONSECUTIVE_FAILURES) {
        this.#failures = 0
        this.#onRepeatedFailure?.(
          new APIConnectionError({
            message: `MAI failed to transcribe ${MAX_CONSECUTIVE_FAILURES} utterances in a row: ${describeError(error)}`,
          }),
        )
      }
      return undefined
    }

    this.#failures = 0
    const resolved = resolveUtteranceLanguage({
      text: winner.text,
      detected: winner.language,
      last: this.#lastLanguage,
    })
    if (resolved.confident) this.#lastLanguage = resolved.language
    this.#log.info(
      {
        source: winner.source,
        msAfterCommit: Math.round(performance.now() - utterance.committedAt),
        detected: winner.language,
        language: resolved.language,
      },
      'MAI final',
    )
    return { text: winner.text, language: resolved.language }
  }

  /** One batch call, with a timeout. Never rejects. `cancel` drops a speculative call. */
  async #batch(
    speech: Int16Array,
    source: 'batch' | 'speculative',
    cancel?: AbortSignal,
  ): Promise<BatchOutcome> {
    const timeout = AbortSignal.timeout(BATCH_TIMEOUT_MS)
    try {
      const result = await this.#transcribers.batch({
        wav: pcmToWav(speech),
        language: this.#language,
        abortSignal: cancel ? AbortSignal.any([cancel, timeout]) : timeout,
      })
      const text = result.text.trim()
      // Empty: noise or a cough, not words.
      return {
        candidate: text ? { source, text, language: result.language } : undefined,
        error: undefined,
      }
    } catch (error) {
      return { candidate: undefined, error: cancel?.aborted ? undefined : error }
    }
  }
}

const NON_LATIN = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu

/** At most 4 CJK characters, or at most 2 words. */
export function isShortUtterance(text: string): boolean {
  const cjk = text.match(CJK)?.length ?? 0
  if (cjk > 0) return cjk <= 4
  return (
    text
      .trim()
      .split(/\s+/)
      .filter((w) => /[\p{L}\p{N}]/u.test(w)).length <= 2
  )
}

/**
 * The language to use for one final transcript (board code):
 * - text in a non-Latin script decides (Han is zh, Hangul is ko, ...): MAI once heard "一杯水。" as en;
 * - otherwise a short utterance (at most 4 CJK characters or 2 words) whose detected language
 *   differs from the session's last confident language keeps the last language;
 * - otherwise MAI's language, else a guess from the text, else the last language.
 * `confident` says whether this result should become the session's last language.
 */
export function resolveUtteranceLanguage(input: {
  text: string
  detected?: string | undefined
  last?: string | undefined
}): { language: string | undefined; confident: boolean } {
  const { text, last } = input
  if (NON_LATIN.test(text)) {
    const script = guessLanguage(text)
    if (script) return { language: script, confident: true }
  }
  const detected = input.detected
    ? (canonicalLanguage(input.detected) ?? boardLanguage(input.detected))
    : undefined
  const candidate = detected ?? guessLanguage(text) ?? undefined
  const short = isShortUtterance(text)
  if (short && last && candidate !== last) return { language: last, confident: false }
  return { language: candidate ?? last, confident: candidate !== undefined && !short }
}

function closeAudio(utterance: Utterance): void {
  try {
    utterance.controller?.close()
  } catch {
    // already closed or cancelled
  }
  utterance.controller = undefined
}

function speechData(text: string, language: string | undefined): stt.SpeechData {
  return {
    language: (language ? normalizeLanguage(language) : '') as LanguageCode,
    text,
    startTime: 0,
    endTime: 0,
    confidence: 1,
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'object' && error !== null) {
    // gateway error parts are plain objects; keep it short (they hold no secrets or audio)
    return JSON.stringify(error).slice(0, 200)
  }
  return String(error)
}

export interface MaiSTTOptions {
  apiKey: string
  /** Room language; 'auto' (default) lets MAI detect it. */
  language?: string
  /** Silence that ends an utterance. */
  silenceMs?: number
  transcribers?: MaiTranscribers
}

export class MaiSTT extends stt.STT {
  readonly label = 'mai.STT'
  readonly #transcribers: MaiTranscribers
  readonly #language: string | undefined
  readonly #roomLanguage: string | undefined
  readonly #vad: inference.VAD

  constructor(options: MaiSTTOptions) {
    super({ streaming: true, interimResults: true })
    this.#transcribers = options.transcribers ?? gatewayTranscribers(options.apiKey)
    const language = options.language ?? 'auto'
    this.#language = maiLanguageHint(language)
    this.#roomLanguage = language === 'auto' ? undefined : language
    this.#vad = new inference.VAD({
      minSilenceDuration: options.silenceMs ?? DEFAULT_MAI_SILENCE_MS,
      minSpeechDuration: 100,
      prefixPaddingDuration: 400,
    })
  }

  override get model(): string {
    return MAI_STREAMING_MODEL
  }

  override get provider(): string {
    return 'Microsoft (AI Gateway)'
  }

  protected async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('MaiSTT only supports streaming; use stream()')
  }

  stream(options?: { connOptions?: APIConnectOptions }): stt.SpeechStream {
    return new MaiSpeechStream(this, this.#vad, {
      transcribers: this.#transcribers,
      language: this.#language,
      roomLanguage: this.#roomLanguage,
      connOptions: options?.connOptions ?? DEFAULT_API_CONNECT_OPTIONS,
    })
  }
}

class MaiSpeechStream extends stt.SpeechStream {
  readonly label = 'mai.SpeechStream'
  readonly #vad: inference.VAD
  readonly #options: {
    transcribers: MaiTranscribers
    language: string | undefined
    roomLanguage: string | undefined
  }

  constructor(
    owner: MaiSTT,
    vad: inference.VAD,
    options: {
      transcribers: MaiTranscribers
      language: string | undefined
      roomLanguage: string | undefined
      connOptions: APIConnectOptions
    },
  ) {
    super(owner, MAI_SAMPLE_RATE, options.connOptions)
    this.#vad = vad
    this.#options = options
  }

  /** One attempt: frames -> VAD -> segmenter. The base class retries it on APIError. */
  protected async run(): Promise<void> {
    const logger = log().child({ stt: this.label })
    let failure: Error | undefined
    const vadStream = this.#vad.stream()
    let vadClosed = false
    const closeVad = () => {
      vadClosed = true
      vadStream.close()
    }
    const segmenter = new MaiSegmenter({
      transcribers: this.#options.transcribers,
      language: this.#options.language,
      roomLanguage: this.#options.roomLanguage,
      logger,
      emit: (event) => {
        if (!this.queue.closed) this.queue.put(event)
      },
      onRepeatedFailure: (error) => {
        failure = error
        closeVad()
      },
    })
    const abort = () => closeVad()
    this.abortSignal.addEventListener('abort', abort, { once: true })

    const pump = (async () => {
      for await (const frame of this.input) {
        if (failure || vadClosed) break
        if (frame === MaiSpeechStream.FLUSH_SENTINEL) {
          vadStream.flush()
        } else {
          vadStream.pushFrame(frame)
        }
      }
      // Not vadStream.endInput(): in 1.9.2 it leaves a rejected promise unhandled
      // ("WritableStream is locked") and takes the process down. A cut-off utterance just gets
      // no final, which is fine at the end of input.
      if (!vadClosed) closeVad()
    })().catch((error: unknown) => {
      // The VAD stream was closed under us (session closing or a reported failure).
      if (!this.abortSignal.aborted && !failure) {
        logger.warn({ error: describeError(error) }, 'MAI audio pump stopped')
      }
    })

    let speaking = false
    try {
      for await (const event of vadStream) {
        // START's frames are the VAD's pre-roll; after that, each INFERENCE_DONE carries the
        // audio it just processed. END's frames are not used: they are a view into the VAD's
        // buffer, which it starts overwriting right after END.
        if (event.type === VADEventType.START_OF_SPEECH) {
          speaking = true
          segmenter.start(event.frames.map(frameData))
        } else if (event.type === VADEventType.INFERENCE_DONE) {
          if (!speaking) continue
          for (const frame of event.frames) segmenter.audio(frameData(frame))
          // A pause inside the utterance: start the batch call early; drop it if speech resumes.
          if (event.rawAccumulatedSilence >= SPECULATE_AFTER_MS) segmenter.speculate()
          else if (event.rawAccumulatedSilence === 0) segmenter.resumed()
        } else if (event.type === VADEventType.END_OF_SPEECH) {
          speaking = false
          void segmenter.end()
        }
      }
      await pump
    } finally {
      this.abortSignal.removeEventListener('abort', abort)
      if (failure) segmenter.close()
    }
    if (failure) throw failure
    // Input ended: let the last utterance's events out before the stream closes.
    await segmenter.drain()
    segmenter.close()
  }
}

function frameData(frame: AudioFrame): Int16Array {
  return frame.data
}

function concat(chunks: readonly Int16Array[]): Int16Array {
  const out = new Int16Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}
