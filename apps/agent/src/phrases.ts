// Pre-rendered audio for the fixed patient phrases (patientMessage: intro, "sent", "cancelled",
// "nurse notified", "one moment", emergency lines). They never change for a given language,
// voice and model, so each is synthesized once and replayed with session.say(text, { audio }),
// skipping a TTS round trip. Kept in memory and in a temp-dir file so later sessions on the same
// host start warm. Anything not cached is spoken normally (and cached for next time).
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { tts, voice } from '@livekit/agents'
import { AudioFrame } from '@livekit/rtc-node'

interface Rendered {
  sampleRate: number
  channels: number
  pcm: Int16Array
}

export interface PhraseLogger {
  debug(fields: Record<string, unknown>, message: string): void
  warn(fields: Record<string, unknown>, message: string): void
}

const CACHE_DIR = join(tmpdir(), 'bell-phrase-cache')
const FRAME_MS = 20

export class PhraseCache {
  readonly #tts: tts.TTS
  /** Voice + model: part of the cache key, so a different voice never replays old audio. */
  readonly #voiceKey: string
  readonly #log: PhraseLogger | undefined
  readonly #ready = new Map<string, Rendered>()
  readonly #pending = new Map<string, Promise<Rendered | undefined>>()

  constructor(options: { tts: tts.TTS; voiceKey: string; logger?: PhraseLogger }) {
    this.#tts = options.tts
    this.#voiceKey = options.voiceKey
    this.#log = options.logger
  }

  /** Starts rendering these phrases in the background (disk first, then TTS). */
  warm(texts: readonly string[]): void {
    for (const text of texts) void this.#render(text)
  }

  /** Says `text`, from cached audio when it is ready; otherwise normal TTS (and caches it). */
  say(
    session: voice.AgentSession,
    text: string,
    options: { allowInterruptions?: boolean } = {},
  ): voice.SpeechHandle {
    const rendered = this.#ready.get(text)
    if (rendered) return session.say(text, { ...options, audio: framesOf(rendered) })
    void this.#render(text)
    return session.say(text, options)
  }

  #render(text: string): Promise<Rendered | undefined> {
    const ready = this.#ready.get(text)
    if (ready) return Promise.resolve(ready)
    let pending = this.#pending.get(text)
    if (!pending) {
      pending = this.#load(text)
        .catch((error: unknown) => {
          this.#log?.warn({ error: String(error) }, 'could not pre-render a phrase')
          return undefined
        })
        .finally(() => this.#pending.delete(text))
      this.#pending.set(text, pending)
    }
    return pending
  }

  async #load(text: string): Promise<Rendered | undefined> {
    const file = join(
      CACHE_DIR,
      `${createHash('sha256').update(`${this.#voiceKey}\n${text}`).digest('hex')}.pcm`,
    )
    let rendered = await readRendered(file)
    if (!rendered) {
      rendered = await synthesize(this.#tts, text)
      if (!rendered) return undefined
      await writeRendered(file, rendered).catch(() => {})
      this.#log?.debug({ chars: text.length }, 'pre-rendered a phrase')
    }
    this.#ready.set(text, rendered)
    return rendered
  }
}

async function synthesize(engine: tts.TTS, text: string): Promise<Rendered | undefined> {
  const stream = engine.synthesize(text)
  const chunks: Int16Array[] = []
  let sampleRate = 0
  let channels = 1
  try {
    for await (const audio of stream) {
      sampleRate = audio.frame.sampleRate
      channels = audio.frame.channels
      chunks.push(audio.frame.data.slice())
    }
  } finally {
    stream.close()
  }
  if (!sampleRate || chunks.length === 0) return undefined
  const pcm = new Int16Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    pcm.set(chunk, offset)
    offset += chunk.length
  }
  return { sampleRate, channels, pcm }
}

/** File layout: uint32 sample rate, uint32 channels, then little-endian 16-bit PCM. */
async function readRendered(file: string): Promise<Rendered | undefined> {
  try {
    const bytes = await readFile(file)
    if (bytes.length < 8) return undefined
    const sampleRate = bytes.readUInt32LE(0)
    const channels = bytes.readUInt32LE(4)
    const body = bytes.subarray(8)
    const pcm = new Int16Array(body.length >> 1)
    for (let i = 0; i < pcm.length; i++) pcm[i] = body.readInt16LE(i * 2)
    return sampleRate && channels && pcm.length ? { sampleRate, channels, pcm } : undefined
  } catch {
    return undefined
  }
}

async function writeRendered(file: string, rendered: Rendered): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true })
  const header = Buffer.alloc(8)
  header.writeUInt32LE(rendered.sampleRate, 0)
  header.writeUInt32LE(rendered.channels, 4)
  const body = Buffer.from(rendered.pcm.buffer, rendered.pcm.byteOffset, rendered.pcm.byteLength)
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, Buffer.concat([header, body]))
  await rename(temp, file)
}

/** A fresh stream of 20 ms frames for one playback. */
function framesOf({ sampleRate, channels, pcm }: Rendered): ReadableStream<AudioFrame> {
  const step = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000)) * channels
  let offset = 0
  return new ReadableStream<AudioFrame>({
    pull(controller) {
      if (offset >= pcm.length) {
        controller.close()
        return
      }
      const data = pcm.slice(offset, offset + step)
      offset += step
      controller.enqueue(new AudioFrame(data, sampleRate, channels, data.length / channels))
    },
  })
}
