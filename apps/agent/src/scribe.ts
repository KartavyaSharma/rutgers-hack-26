// ElevenLabs Scribe v2 Realtime, the main transcriber (MAI is the backup; see stt.ts).
//
// One websocket per session, manual commits only: our VAD decides where an utterance ends (Scribe's
// own VAD split Korean and Hindi greetings and mis-tagged Hindi, measured). Every utterance's audio
// goes to Scribe and is committed when our VAD ends it; the committed transcript arrives ~100-270
// ms later. A Scribe that is down never blocks anything: commit() then resolves to undefined.
import { DEFAULT_SCRIBE_MODEL } from './env'
import { boardLanguage } from './languages'

export const SCRIBE_REALTIME_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime'
const SAMPLE_RATE = 16_000
/** Audio is sent in chunks of at most this many samples (100 ms). */
const MAX_CHUNK_SAMPLES = 1600
/** A committed transcript that takes longer than this is given up on. */
const COMMIT_TIMEOUT_MS = 2000
const KEEPALIVE_MS = 10_000
const RECONNECT_MIN_MS = 500
const RECONNECT_MAX_MS = 15_000
/** Scribe's errors that mean the session is unusable. */
const ERROR_TYPES = new Set([
  'auth_error',
  'quota_exceeded',
  'transcriber_error',
  'input_error',
  'error',
])

export interface ScribeResult {
  text: string
  /** Board code (Scribe's "fil" is the board's "tl"). */
  language: string | undefined
}

/** What the segmenter needs from Scribe, one utterance at a time. */
export interface ScribeTranscriber {
  /** An utterance starts. */
  begin(): void
  /** Audio for the current utterance (16 kHz mono PCM). */
  audio(pcm: Int16Array): void
  /**
   * Whether the current utterance can still get a transcript: connected, and none of its audio
   * lost. False means the backup has to transcribe it.
   */
  readonly usable: boolean
  /** The utterance ended: its committed transcript, or undefined if Scribe can't give one. */
  commit(): Promise<ScribeResult | undefined>
  /** The utterance was abandoned (no transcript wanted); clears Scribe's buffer. */
  cancel(): void
  close(): void
}

/** The parts of a WebSocket this client uses (the global WebSocket, or a fake in tests). */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code?: number; reason?: string }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export interface ScribeLogger {
  debug(fields: Record<string, unknown>, message: string): void
  info(fields: Record<string, unknown>, message: string): void
  warn(fields: Record<string, unknown>, message: string): void
}

export interface ScribeOptions {
  apiKey: string
  model?: string
  /** language_code hint (see scribeLanguageHint); undefined to auto-detect. */
  languageCode?: string
  logger?: ScribeLogger
  /** Opens the socket; defaults to the global WebSocket with the xi-api-key header. */
  openSocket?: (url: string, headers: Record<string, string>) => SocketLike
}

interface PendingCommit {
  resolve: (result: ScribeResult | undefined) => void
  /** Timed out or discarded: the matching message is consumed but ignored. */
  done: boolean
}

const OPEN = 1
const NOOP_LOGGER: ScribeLogger = { debug() {}, info() {}, warn() {} }

const defaultOpenSocket = (url: string, headers: Record<string, string>): SocketLike =>
  // Node's WebSocket (undici) accepts headers in its init object.
  new WebSocket(url, { headers } as unknown as string[]) as unknown as SocketLike

export class ScribeRealtime implements ScribeTranscriber {
  readonly #url: string
  readonly #apiKey: string
  readonly #log: ScribeLogger
  readonly #openSocket: (url: string, headers: Record<string, string>) => SocketLike
  #socket: SocketLike | undefined
  /** session_started received on the current socket. */
  #ready = false
  #closed = false
  #reconnectDelay = RECONNECT_MIN_MS
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined
  #keepalive: ReturnType<typeof setInterval> | undefined
  /** Commits sent and not answered yet, in order (Scribe answers them in order). */
  #pending: PendingCommit[] = []
  #inUtterance = false
  /** Part of the current utterance never reached Scribe (not ready, or the socket dropped). */
  #tainted = false

  constructor(options: ScribeOptions) {
    const params = new URLSearchParams({
      model_id: options.model ?? DEFAULT_SCRIBE_MODEL,
      audio_format: `pcm_${SAMPLE_RATE}`,
      commit_strategy: 'manual',
      include_language_detection: 'true',
      enable_logging: 'false',
    })
    if (options.languageCode) params.set('language_code', options.languageCode)
    this.#url = `${SCRIBE_REALTIME_URL}?${params}`
    this.#apiKey = options.apiKey
    this.#log = options.logger ?? NOOP_LOGGER
    this.#openSocket = options.openSocket ?? defaultOpenSocket
    this.#connect()
  }

  get ready(): boolean {
    return this.#ready
  }

  get usable(): boolean {
    return this.#inUtterance && !this.#tainted && this.#ready && this.#socket?.readyState === OPEN
  }

  begin(): void {
    this.#inUtterance = true
    this.#tainted = !this.#ready
  }

  audio(pcm: Int16Array): void {
    if (!this.#inUtterance) return
    if (!this.#ready || this.#socket?.readyState !== OPEN) {
      this.#tainted = true
      return
    }
    for (let offset = 0; offset < pcm.length; offset += MAX_CHUNK_SAMPLES) {
      const chunk = pcm.subarray(offset, offset + MAX_CHUNK_SAMPLES)
      this.#send({
        message_type: 'input_audio_chunk',
        audio_base_64: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString(
          'base64',
        ),
        commit: false,
        sample_rate: SAMPLE_RATE,
      })
    }
  }

  commit(): Promise<ScribeResult | undefined> {
    if (!this.#inUtterance) return Promise.resolve(undefined)
    this.#inUtterance = false
    if (!this.#ready || this.#socket?.readyState !== OPEN) return Promise.resolve(undefined)
    const usable = !this.#tainted
    return new Promise((resolve) => {
      const pending: PendingCommit = { resolve, done: false }
      this.#pending.push(pending)
      this.#send({
        message_type: 'input_audio_chunk',
        audio_base_64: '',
        commit: true,
        sample_rate: SAMPLE_RATE,
      })
      if (!usable) {
        // still committed, to clear Scribe's buffer, but the transcript would be partial
        pending.done = true
        resolve(undefined)
        return
      }
      setTimeout(() => {
        if (pending.done) return
        pending.done = true
        this.#log.debug({}, 'Scribe commit timed out')
        resolve(undefined)
      }, COMMIT_TIMEOUT_MS)
    })
  }

  cancel(): void {
    if (!this.#inUtterance) return
    this.#tainted = true
    void this.commit()
  }

  close(): void {
    this.#closed = true
    if (this.#reconnectTimer !== undefined) clearTimeout(this.#reconnectTimer)
    this.#stopKeepalive()
    this.#failPending()
    try {
      this.#socket?.close()
    } catch {
      // already closed
    }
    this.#socket = undefined
  }

  #connect(): void {
    if (this.#closed) return
    let socket: SocketLike
    try {
      socket = this.#openSocket(this.#url, { 'xi-api-key': this.#apiKey })
    } catch (error) {
      this.#log.warn({ error: describeError(error) }, 'Scribe connection failed')
      this.#scheduleReconnect()
      return
    }
    this.#socket = socket
    this.#ready = false
    socket.onmessage = (event) => this.#onMessage(socket, event.data)
    socket.onerror = () => {
      // onclose follows and handles it
    }
    socket.onclose = (event) => {
      if (this.#socket !== socket) return
      this.#socket = undefined
      this.#ready = false
      this.#stopKeepalive()
      this.#failPending()
      if (this.#inUtterance) this.#tainted = true
      if (this.#closed) return
      this.#log.warn({ code: event.code, reason: event.reason }, 'Scribe connection closed')
      this.#scheduleReconnect()
    }
  }

  #onMessage(socket: SocketLike, data: unknown): void {
    if (this.#socket !== socket) return
    let message: {
      message_type?: unknown
      text?: unknown
      language_code?: unknown
      message?: unknown
    }
    try {
      message = JSON.parse(String(data))
    } catch {
      return
    }
    const type = typeof message.message_type === 'string' ? message.message_type : ''
    if (type === 'session_started') {
      this.#ready = true
      this.#reconnectDelay = RECONNECT_MIN_MS
      this.#startKeepalive()
      this.#log.info({}, 'Scribe session started')
    } else if (type === 'committed_transcript_with_timestamps') {
      // (a plain committed_transcript follows for the same commit; it carries no language)
      const pending = this.#pending.shift()
      if (!pending || pending.done) return
      pending.done = true
      pending.resolve({
        text: typeof message.text === 'string' ? message.text.trim() : '',
        language:
          typeof message.language_code === 'string'
            ? boardLanguage(message.language_code)
            : undefined,
      })
    } else if (ERROR_TYPES.has(type)) {
      this.#log.warn(
        { type, message: String(message.message ?? '').slice(0, 120) },
        'Scribe reported an error',
      )
      this.#failPending()
      try {
        socket.close()
      } catch {
        // already closed
      }
    }
  }

  #send(message: Record<string, unknown>): void {
    try {
      this.#socket?.send(JSON.stringify(message))
    } catch {
      this.#tainted = true
    }
  }

  #failPending(): void {
    const pending = this.#pending
    this.#pending = []
    for (const p of pending) {
      if (p.done) continue
      p.done = true
      p.resolve(undefined)
    }
  }

  #scheduleReconnect(): void {
    if (this.#closed || this.#reconnectTimer !== undefined) return
    const wait = this.#reconnectDelay
    this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, RECONNECT_MAX_MS)
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined
      this.#connect()
    }, wait)
  }

  #startKeepalive(): void {
    this.#stopKeepalive()
    this.#keepalive = setInterval(() => {
      if (this.#ready && !this.#inUtterance) {
        this.#send({
          message_type: 'input_audio_chunk',
          audio_base_64: '',
          commit: false,
          sample_rate: SAMPLE_RATE,
        })
      }
    }, KEEPALIVE_MS)
  }

  #stopKeepalive(): void {
    if (this.#keepalive !== undefined) clearInterval(this.#keepalive)
    this.#keepalive = undefined
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
