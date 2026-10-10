// Speech to text for the bedside agent, as one LiveKit STT: ElevenLabs Scribe v2 Realtime is the
// main transcriber, MAI-Transcribe-2 (AI Gateway) the backup.
//
// Each utterance is cut out by a local VAD (the bundled silero), and:
// - its audio goes to Scribe, committed when the VAD ends the utterance; Scribe's committed
//   transcript is the FINAL_TRANSCRIPT, used as soon as it arrives (~100-270 ms after the commit);
// - MAI's streaming model hears it too, for the live partials (INTERIM_TRANSCRIPT): MAI's first
//   partial comes ~1 s after speech starts, Scribe's ~2 s (measured);
// - MAI gives the final instead when Scribe can't: Scribe not connected or failed for that
//   utterance, no answer within SCRIBE_STALL_MS, no words, or text in the wrong script for its
//   language, the room's or the session's (then MAI only if it is in within 400 ms). MAI's
//   streaming final is used when it is already in; otherwise a batch call starts then, so a
//   healthy Scribe costs no MAI batch calls. Only when Scribe is already known to be down for the
//   utterance does the batch call start early, during the pause before the commit.
// Events per utterance: START_OF_SPEECH (first partial, or just before the final),
// INTERIM_TRANSCRIPT*, FINAL_TRANSCRIPT, END_OF_SPEECH. With turnDetection 'stt' that END closes
// the user's turn.
import { guessLanguage } from '@bell/core'
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
import { DEFAULT_SCRIBE_MODEL, DEFAULT_SCRIBE_STALL_MS } from './env'
import { boardLanguage, boardLanguageCode, scribeLanguageHint, scriptFits } from './languages'
import { ScribeRealtime, type ScribeResult, type ScribeTranscriber } from './scribe'
import {
  describeError,
  failureInfo,
  gatewayTranscribers,
  MaiBackup,
  type MaiCandidate,
  type MaiOutcome,
  type MaiTranscribers,
  maiLanguageHint,
  type SttLogger,
  withTimeout,
} from './stt-mai'

export const SAMPLE_RATE = 16_000
/** Silence that ends an utterance. Also the main part of the end-of-turn delay. */
export const DEFAULT_SILENCE_MS = 600
/** Scribe's text is in the wrong script: MAI's final is used if it is in within this long. */
export const SCRIPT_MISMATCH_WAIT_MS = 400
/** Silence after which MAI's batch call starts early (only when Scribe is down). */
export const SPECULATE_AFTER_MS = 250
/** Utterances in a row with no transcript at all before the stream reports a connection error. */
const MAX_CONSECUTIVE_FAILURES = 3

/** Why MAI was asked for the final. */
export type FallbackReason = 'unavailable' | 'stalled' | 'empty' | 'script'

interface Candidate {
  source: 'scribe' | MaiCandidate['source']
  text: string
  language: string | undefined
}

export interface SegmenterOptions {
  emit: (event: stt.SpeechEvent) => void
  /** The main transcriber. */
  scribe: ScribeTranscriber
  /** The backup: live partials and the final when Scribe can't give one. Omit for none. */
  mai?: MaiBackup
  /** The room's language (board code), the starting point for sticky language; undefined for auto. */
  roomLanguage?: string
  /** How long after the commit Scribe may take before MAI is asked (SCRIBE_STALL_MS). */
  stallMs?: number
  logger?: SttLogger
  /** Called after MAX_CONSECUTIVE_FAILURES utterances in a row produced no transcript at all. */
  onRepeatedFailure?: (error: Error) => void
  /**
   * Called when speech could not be transcribed at all (every attempt failed), so the patient can
   * be asked to repeat it instead of hearing nothing.
   */
  onLost?: () => void
}

interface Utterance {
  /** MAI's live audio, while the utterance lasts (undefined without MAI). */
  controller: ReadableStreamDefaultController<Uint8Array> | undefined
  /** Copies of all audio so far (pre-roll + live), for a MAI batch call. */
  chunks: Int16Array[]
  /** Ends MAI's live session. */
  abort: AbortController
  /** START_OF_SPEECH was emitted. */
  started: boolean
  /** The FINAL/END pair was emitted; later partials are ignored. */
  done: boolean
  /** MAI's streaming final, or undefined (failed, or no MAI). */
  streamedFinal: Promise<string | undefined>
  /** MAI's streaming final once it is in. */
  streamedText: string | undefined
  /** A MAI batch call started during a pause (Scribe down); dropped if speech resumes. */
  speculative: { abort: AbortController; result: Promise<MaiOutcome> } | undefined
  /** When the utterance was committed, for logging. */
  committedAt: number
  /** Scribe's committed transcript (undefined: Scribe couldn't give one). */
  scribe: Promise<ScribeResult | undefined>
  /** The final was chosen: MAI's last retry is skipped. */
  decided: boolean
}

const NOOP_LOGGER: SttLogger = { debug() {}, info() {}, warn() {} }

/**
 * Turns VAD-cut utterances into LiveKit speech events, Scribe first with MAI as the backup. No
 * LiveKit runtime needed, so it is unit-testable. Events of one utterance are never interleaved
 * with the next.
 */
export class Segmenter {
  readonly #emit: (event: stt.SpeechEvent) => void
  readonly #scribe: ScribeTranscriber
  readonly #mai: MaiBackup | undefined
  readonly #roomLanguage: string | undefined
  readonly #stallMs: number
  readonly #log: SttLogger
  readonly #onRepeatedFailure: ((error: Error) => void) | undefined
  readonly #onLost: (() => void) | undefined
  #current: Utterance | undefined
  /** Resolves when everything emitted so far is out; each utterance chains onto it. */
  #tail: Promise<void> = Promise.resolve()
  #failures = 0
  #closed = false
  /** The session's last confident language (board code). */
  #lastLanguage: string | undefined

  constructor(options: SegmenterOptions) {
    this.#emit = options.emit
    this.#scribe = options.scribe
    this.#mai = options.mai
    this.#roomLanguage = options.roomLanguage
    this.#lastLanguage = options.roomLanguage
    this.#stallMs = options.stallMs ?? DEFAULT_SCRIBE_STALL_MS
    this.#log = options.logger ?? NOOP_LOGGER
    this.#onRepeatedFailure = options.onRepeatedFailure
    this.#onLost = options.onLost
  }

  /** Speech started; `preroll` is the audio the VAD already holds for it. */
  start(preroll: readonly Int16Array[]): void {
    if (this.#closed) return
    if (this.#current) {
      closeAudio(this.#current)
      this.#scribe.cancel()
    }
    this.#scribe.begin()
    const utterance: Utterance = {
      controller: undefined,
      chunks: [],
      abort: new AbortController(),
      started: false,
      done: false,
      streamedFinal: Promise.resolve(undefined),
      streamedText: undefined,
      speculative: undefined,
      committedAt: 0,
      scribe: Promise.resolve(undefined),
      decided: false,
    }
    const audio = this.#mai
      ? new ReadableStream<Uint8Array>({
          start: (controller) => {
            utterance.controller = controller
          },
          // A failed session cancels its audio; keep recording the utterance for a batch call.
          cancel: () => {
            utterance.controller = undefined
          },
        })
      : undefined
    for (const pcm of preroll) this.#push(utterance, pcm)
    if (this.#mai && audio) {
      utterance.streamedFinal = this.#mai
        .live({
          audio,
          abortSignal: utterance.abort.signal,
          // The previous utterance's FINAL/END must go out before this one's first partial.
          before: this.#tail,
          onPartial: (text) => this.#interim(utterance, text),
        })
        .then((text) => {
          utterance.streamedText = text
          return text
        })
    }
    this.#current = utterance
  }

  /** More audio for the current utterance. */
  audio(pcm: Int16Array): void {
    if (this.#current) this.#push(this.#current, pcm)
  }

  /**
   * A pause long enough to guess the utterance may be over. If Scribe can't transcribe this
   * utterance anyway, MAI's batch call starts now, in parallel with the rest of the silence wait.
   */
  speculate(): void {
    const utterance = this.#current
    if (!utterance || !this.#mai || utterance.speculative || this.#closed) return
    if (this.#scribe.usable) return
    const abort = new AbortController()
    utterance.speculative = {
      abort,
      result: this.#mai.batch(concat(utterance.chunks), 'speculative', 1, abort.signal),
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
   * Speech ended: commits Scribe (and MAI's live session). Resolves once the utterance's FINAL
   * and END events are out (or skipped, for an utterance with no words).
   */
  end(): Promise<void> {
    const utterance = this.#current
    this.#current = undefined
    if (!utterance || this.#closed) return Promise.resolve()
    closeAudio(utterance) // commits MAI's live session
    utterance.committedAt = performance.now()
    utterance.scribe = this.#scribe.commit()
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
      // MAI's live session has done its job either way; a failing one would linger ~7 s.
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
      this.#scribe.cancel()
    }
    await this.#tail
  }

  close(): void {
    this.#closed = true
    if (this.#current) {
      closeAudio(this.#current)
      this.#scribe.cancel()
    }
    this.#current?.abort.abort()
    this.#current?.speculative?.abort.abort()
    this.#current = undefined
  }

  /** Copies the audio (callers may reuse their buffers) for Scribe, MAI's live session and a batch call. */
  #push(utterance: Utterance, pcm: Int16Array): void {
    const copy = pcm.slice()
    this.#scribe.audio(copy)
    if (!this.#mai) return
    utterance.chunks.push(copy)
    try {
      utterance.controller?.enqueue(new Uint8Array(copy.buffer, copy.byteOffset, copy.byteLength))
    } catch {
      // the session's audio stream is already closed or cancelled
      utterance.controller = undefined
    }
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
   * The utterance's final: Scribe's committed transcript as soon as it arrives, unless MAI has to
   * step in (see FallbackReason). If nothing worked, onLost asks the patient to repeat.
   */
  async #resolveFinal(
    utterance: Utterance,
  ): Promise<{ text: string; language: string | undefined } | undefined> {
    const scribe = utterance.scribe
    const settled = await withTimeout(
      scribe.then((result) => ({ result })),
      this.#stallMs,
    )
    let reason: FallbackReason | undefined
    let scribeCandidate: Candidate | undefined
    if (!settled) reason = 'stalled'
    else if (!settled.result) reason = 'unavailable'
    else if (!settled.result.text) reason = 'empty'
    else {
      scribeCandidate = toCandidate(settled.result)
      if (!this.#scriptFits(scribeCandidate)) reason = 'script'
    }

    let winner: Candidate | undefined = reason ? undefined : scribeCandidate
    const mai = reason ? this.#maiFinal(utterance) : undefined
    const maiCandidate = mai ? mai.then((outcome) => outcome.candidate) : undefined
    if (reason === 'script') {
      const backup = maiCandidate && (await withTimeout(maiCandidate, SCRIPT_MISMATCH_WAIT_MS))
      winner = backup ?? scribeCandidate
    } else if (reason === 'stalled') {
      // a late Scribe transcript still counts
      const late = scribe.then((result) => (result?.text ? toCandidate(result) : undefined))
      winner = await firstDefined(maiCandidate ? [maiCandidate, late] : [late])
    } else if (reason && maiCandidate) {
      winner = await maiCandidate
    }
    utterance.decided = true

    if (!winner) {
      // Either transcriber hearing no words means noise or a cough, not lost speech.
      const scribeResult = await scribe
      const outcome = mai ? await mai : undefined
      if (scribeResult?.text === '' || (outcome && outcome.error === undefined)) return undefined
      this.#lost(outcome?.error ?? new Error('Scribe could not transcribe it'), reason)
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
        ...(reason ? { fallback: reason } : {}),
      },
      'STT final',
    )
    return { text: winner.text, language: resolved.language }
  }

  /** Scribe's text is in a script its own language, the room's and the session's all use. */
  #scriptFits(candidate: Candidate): boolean {
    return (
      scriptFits(candidate.text, candidate.language) &&
      scriptFits(candidate.text, this.#roomLanguage) &&
      scriptFits(candidate.text, this.#lastLanguage)
    )
  }

  #maiFinal(utterance: Utterance): Promise<MaiOutcome> | undefined {
    return this.#mai?.final({
      speech: concat(utterance.chunks),
      streamed: utterance.streamedFinal,
      streamedText: utterance.streamedText,
      speculative: utterance.speculative?.result,
      skipRetry: () => this.#closed || utterance.decided,
    })
  }

  /** Speech that could not be transcribed: never silent, the patient is asked to repeat. */
  #lost(error: unknown, reason: FallbackReason | undefined): void {
    this.#failures++
    this.#log.warn(
      { reason, ...failureInfo(error), failures: this.#failures },
      'could not transcribe an utterance; asking the patient to repeat',
    )
    if (!this.#closed) {
      try {
        this.#onLost?.()
      } catch (lostError) {
        this.#log.warn({ error: describeError(lostError) }, 'could not ask the patient to repeat')
      }
    }
    if (this.#failures >= MAX_CONSECUTIVE_FAILURES) {
      this.#failures = 0
      this.#onRepeatedFailure?.(
        new APIConnectionError({
          message: `speech could not be transcribed ${MAX_CONSECUTIVE_FAILURES} utterances in a row: ${describeError(error)}`,
        }),
      )
    }
  }
}

function toCandidate(result: ScribeResult): Candidate {
  return { source: 'scribe', text: result.text, language: result.language }
}

const NON_LATIN = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u
/** Scripts measured in characters (written without spaces between words). */
const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/gu

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
 * - text in a non-Latin script: the transcriber's language when the text is in its script
 *   (Scribe tells Serbian, Kyrgyz or Tajik Cyrillic apart), else core's guess from the script
 *   (MAI once heard "一杯水。" as en);
 * - otherwise a short utterance (at most 4 CJK characters or 2 words) whose detected language
 *   differs from the session's last confident language keeps the last language;
 * - otherwise the transcriber's language, else a guess from the text, else the last language.
 * `confident` says whether this result should become the session's last language.
 */
export function resolveUtteranceLanguage(input: {
  text: string
  detected?: string | undefined
  last?: string | undefined
}): { language: string | undefined; confident: boolean } {
  const { text, last } = input
  const detected = boardLanguageCode(input.detected)
  if (NON_LATIN.test(text)) {
    if (detected && scriptFits(text, detected)) return { language: detected, confident: true }
    const script = guessLanguage(text)
    if (script) return { language: script, confident: true }
    // a non-Latin script core can't name: the transcriber's own detection on it is trusted
    const fromModel = boardLanguage(input.detected)
    if (fromModel) return { language: fromModel, confident: true }
  }
  const candidate = detected ?? guessLanguage(text) ?? undefined
  const short = isShortUtterance(text)
  if (short && last && candidate !== last) return { language: last, confident: false }
  return { language: candidate ?? last, confident: candidate !== undefined && !short }
}

/** The first promise to resolve to a value; undefined once all resolved empty (never rejects). */
function firstDefined<T>(promises: readonly Promise<T | undefined>[]): Promise<T | undefined> {
  return new Promise((resolve) => {
    let pending = promises.length
    const settleEmpty = () => {
      pending--
      if (pending === 0) resolve(undefined)
    }
    for (const promise of promises) {
      promise.then((value) => (value === undefined ? settleEmpty() : resolve(value)), settleEmpty)
    }
  })
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

export interface ScribeSTTOptions {
  scribe: {
    apiKey: string
    model?: string
    /** SCRIBE_STALL_MS: how long after the commit before MAI is asked. */
    stallMs?: number
  }
  /** MAI through the AI Gateway as the backup; omit for none (and no live partials). */
  mai?: { apiKey: string; transcribers?: MaiTranscribers }
  /** Room language; 'auto' (default) lets the transcribers detect it. */
  language?: string
  /** Silence that ends an utterance. */
  silenceMs?: number
  /** Speech could not be transcribed at all; the agent should ask the patient to repeat. */
  onLost?: () => void
}

export class ScribeSTT extends stt.STT {
  readonly label = 'scribe.STT'
  readonly #options: ScribeSTTOptions
  readonly #maiTranscribers: MaiTranscribers | undefined
  readonly #roomLanguage: string | undefined
  readonly #vad: inference.VAD

  constructor(options: ScribeSTTOptions) {
    super({ streaming: true, interimResults: options.mai !== undefined })
    this.#options = options
    this.#maiTranscribers = options.mai
      ? (options.mai.transcribers ?? gatewayTranscribers(options.mai.apiKey))
      : undefined
    const language = options.language ?? 'auto'
    this.#roomLanguage = language === 'auto' ? undefined : language
    this.#vad = new inference.VAD({
      minSilenceDuration: options.silenceMs ?? DEFAULT_SILENCE_MS,
      minSpeechDuration: 100,
      prefixPaddingDuration: 400,
    })
  }

  override get model(): string {
    return this.#options.scribe.model ?? DEFAULT_SCRIBE_MODEL
  }

  override get provider(): string {
    return 'ElevenLabs'
  }

  protected async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('ScribeSTT only supports streaming; use stream()')
  }

  stream(options?: { connOptions?: APIConnectOptions }): stt.SpeechStream {
    return new ScribeSpeechStream(this, this.#vad, {
      scribe: this.#options.scribe,
      maiTranscribers: this.#maiTranscribers,
      roomLanguage: this.#roomLanguage,
      onLost: this.#options.onLost,
      connOptions: options?.connOptions ?? DEFAULT_API_CONNECT_OPTIONS,
    })
  }
}

interface StreamOptions {
  scribe: ScribeSTTOptions['scribe']
  maiTranscribers: MaiTranscribers | undefined
  roomLanguage: string | undefined
  onLost: (() => void) | undefined
}

class ScribeSpeechStream extends stt.SpeechStream {
  readonly label = 'scribe.SpeechStream'
  readonly #vad: inference.VAD
  readonly #options: StreamOptions

  constructor(
    owner: ScribeSTT,
    vad: inference.VAD,
    options: StreamOptions & { connOptions: APIConnectOptions },
  ) {
    super(owner, SAMPLE_RATE, options.connOptions)
    this.#vad = vad
    this.#options = options
  }

  /** One attempt: frames -> VAD -> segmenter. The base class retries it on APIError. */
  protected async run(): Promise<void> {
    const logger = log().child({ stt: this.label })
    const { roomLanguage } = this.#options
    let failure: Error | undefined
    const vadStream = this.#vad.stream()
    let vadClosed = false
    const closeVad = () => {
      vadClosed = true
      vadStream.close()
    }
    // One Scribe socket per session (per attempt); it reconnects by itself if it drops.
    const scribe = new ScribeRealtime({
      apiKey: this.#options.scribe.apiKey,
      model: this.#options.scribe.model,
      languageCode: scribeLanguageHint(roomLanguage ?? 'auto'),
      logger,
    })
    const mai = this.#options.maiTranscribers
      ? new MaiBackup({
          transcribers: this.#options.maiTranscribers,
          language: maiLanguageHint(roomLanguage ?? 'auto'),
          logger,
        })
      : undefined
    const segmenter = new Segmenter({
      scribe,
      mai,
      roomLanguage,
      stallMs: this.#options.scribe.stallMs,
      onLost: this.#options.onLost,
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
        if (frame === ScribeSpeechStream.FLUSH_SENTINEL) {
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
        logger.warn({ error: describeError(error) }, 'STT audio pump stopped')
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
          // A pause inside the utterance (see speculate); dropped if speech resumes.
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
      if (failure) {
        segmenter.close()
        scribe.close()
      }
    }
    if (failure) throw failure
    // Input ended: let the last utterance's events out before the stream closes.
    await segmenter.drain()
    segmenter.close()
    scribe.close()
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
