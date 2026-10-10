import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScribeRealtime, type SocketLike } from './scribe'

interface FakeSocket extends SocketLike {
  url: string
  headers: Record<string, string>
  sent: Array<Record<string, unknown>>
  readyState: number
  receive(message: Record<string, unknown>): void
  drop(): void
}

function fakeSockets() {
  const sockets: FakeSocket[] = []
  const openSocket = vi.fn((url: string, headers: Record<string, string>) => {
    const socket: FakeSocket = {
      url,
      headers,
      sent: [],
      readyState: 1,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send(data) {
        socket.sent.push(JSON.parse(data))
      },
      close() {
        socket.readyState = 3
      },
      receive(message) {
        socket.onmessage?.({ data: JSON.stringify(message) })
      },
      drop() {
        socket.readyState = 3
        socket.onclose?.({ code: 1006, reason: 'gone' })
      },
    }
    sockets.push(socket)
    return socket
  })
  return { sockets, openSocket }
}

let scribe: ScribeRealtime | undefined
afterEach(() => {
  scribe?.close()
  scribe = undefined
  vi.useRealTimers()
})

describe('ScribeRealtime', () => {
  it('opens one manual-commit socket with language detection and the API key header', () => {
    const { sockets, openSocket } = fakeSockets()
    scribe = new ScribeRealtime({ apiKey: 'key', languageCode: 'ko', openSocket })

    expect(sockets).toHaveLength(1)
    const url = new URL(sockets[0]?.url ?? '')
    expect(url.searchParams.get('commit_strategy')).toBe('manual')
    expect(url.searchParams.get('include_language_detection')).toBe('true')
    expect(url.searchParams.get('model_id')).toBe('scribe_v2_realtime')
    expect(url.searchParams.get('language_code')).toBe('ko')
    expect(sockets[0]?.headers).toEqual({ 'xi-api-key': 'key' })
  })

  it('sends the audio in chunks, commits, and maps the committed transcript', async () => {
    const { sockets, openSocket } = fakeSockets()
    scribe = new ScribeRealtime({ apiKey: 'key', openSocket })
    const socket = sockets[0]
    socket?.receive({ message_type: 'session_started', session_id: 's1' })

    scribe.begin()
    scribe.audio(new Int16Array(3200)) // 200 ms: two 100 ms chunks
    const result = scribe.commit()

    const chunks = socket?.sent.filter((m) => m.commit === false) ?? []
    expect(chunks).toHaveLength(2)
    expect(socket?.sent.at(-1)).toMatchObject({ audio_base_64: '', commit: true })

    socket?.receive({
      message_type: 'committed_transcript_with_timestamps',
      text: ' Hello po ',
      language_code: 'fil',
    })
    socket?.receive({ message_type: 'committed_transcript', text: 'Hello po' }) // ignored
    expect(await result).toEqual({ text: 'Hello po', language: 'tl' })
  })

  it('gives nothing for an utterance that began before the session was ready', async () => {
    const { sockets, openSocket } = fakeSockets()
    scribe = new ScribeRealtime({ apiKey: 'key', openSocket })

    scribe.begin()
    scribe.audio(new Int16Array(320))
    sockets[0]?.receive({ message_type: 'session_started' })
    expect(await scribe.commit()).toBeUndefined()
  })

  it('resolves a pending commit as unavailable when the socket drops, then reconnects', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const { sockets, openSocket } = fakeSockets()
    scribe = new ScribeRealtime({ apiKey: 'key', openSocket })
    sockets[0]?.receive({ message_type: 'session_started' })

    scribe.begin()
    scribe.audio(new Int16Array(320))
    const result = scribe.commit()
    sockets[0]?.drop()

    expect(await result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(600)
    expect(openSocket).toHaveBeenCalledTimes(2)
  })

  it('treats an error message as unavailable', async () => {
    const { sockets, openSocket } = fakeSockets()
    scribe = new ScribeRealtime({ apiKey: 'key', openSocket })
    sockets[0]?.receive({ message_type: 'session_started' })

    scribe.begin()
    const result = scribe.commit()
    sockets[0]?.receive({ message_type: 'quota_exceeded', message: 'over' })
    expect(await result).toBeUndefined()
  })
})
