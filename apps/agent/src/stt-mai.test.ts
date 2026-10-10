import { stt } from '@livekit/agents'
import type { TranscriptionStreamPart } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import { interruptionWords } from './interruptions'
import {
  boardLanguage,
  isShortUtterance,
  MaiSegmenter,
  type MaiTranscribers,
  maiLanguageHint,
  pcmToWav,
  resolveUtteranceLanguage,
} from './stt-mai'

const { START_OF_SPEECH, INTERIM_TRANSCRIPT, FINAL_TRANSCRIPT, END_OF_SPEECH } = stt.SpeechEventType

/** A scripted streaming session; `gate` holds it open until released. */
function session(parts: TranscriptionStreamPart[], gate?: Promise<void>) {
  return async function* (): AsyncIterable<TranscriptionStreamPart> {
    for (const part of parts) yield part
    await gate
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Fake MAI: one scripted session and one batch result per utterance, in order. */
function fakeMai(
  sessions: Array<() => AsyncIterable<TranscriptionStreamPart>>,
  batches: Array<() => Promise<{ text: string; language?: string }>>,
) {
  const stream = vi.fn<MaiTranscribers['stream']>(() => {
    const next = sessions.shift()
    if (!next) throw new Error('no session scripted')
    return next()
  })
  const batch = vi.fn<MaiTranscribers['batch']>(() => {
    const next = batches.shift()
    if (!next) throw new Error('no batch scripted')
    return next()
  })
  return { stream, batch } satisfies MaiTranscribers
}

function harness(
  transcribers: MaiTranscribers,
  options: { language?: string; roomLanguage?: string } = {},
) {
  const events: stt.SpeechEvent[] = []
  const onRepeatedFailure = vi.fn()
  const segmenter = new MaiSegmenter({
    transcribers,
    emit: (event) => events.push(event),
    onRepeatedFailure,
    ...options,
  })
  /** [type, text, language] per event, for compact assertions. */
  const summary = () =>
    events.map((e) => {
      const alt = e.alternatives?.[0]
      return alt ? [e.type, alt.text, alt.language] : [e.type]
    })
  return { segmenter, events, summary, onRepeatedFailure }
}

const pcm = (samples = 320) => new Int16Array(samples).fill(1000)
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('MaiSegmenter', () => {
  it('maps partials to START + interims, then the batch transcript to FINAL + END', async () => {
    const mai = fakeMai(
      [
        session([
          { type: 'transcript-partial', text: 'Hola' },
          { type: 'transcript-partial', text: 'Hola, me' },
          { type: 'transcript-delta', delta: 'Hola' },
          { type: 'transcript-partial', text: ', ¿me traes agua?' },
          { type: 'transcript-final', text: 'Hola, ¿me traes agua?' },
        ]),
      ],
      [async () => ({ text: 'Hola, ¿me traes agua?', language: 'es' })],
    )
    const { segmenter, summary } = harness(mai, { language: 'es' })

    segmenter.start([pcm()])
    segmenter.audio(pcm())
    await tick()
    await segmenter.end()

    expect(summary()).toEqual([
      [START_OF_SPEECH],
      [INTERIM_TRANSCRIPT, 'Hola', ''],
      [INTERIM_TRANSCRIPT, 'Hola, me', ''],
      [INTERIM_TRANSCRIPT, 'Hola, ¿me traes agua?', ''],
      [FINAL_TRANSCRIPT, 'Hola, ¿me traes agua?', 'es'],
      [END_OF_SPEECH, 'Hola, ¿me traes agua?', 'es'],
    ])
    expect(mai.stream).toHaveBeenCalledWith(expect.objectContaining({ language: 'es' }))
    const wav = mai.batch.mock.calls[0]?.[0].wav
    expect(wav?.byteLength).toBe(44 + 640 * 2)
  })

  it('keeps its own copy of the audio, since the VAD overwrites its buffer after END', async () => {
    const mai = fakeMai([session([])], [async () => ({ text: 'hi', language: 'en' })])
    const { segmenter } = harness(mai)

    const preroll = new Int16Array([1, 2, 3])
    const live = new Int16Array([4, 5])
    segmenter.start([preroll])
    segmenter.audio(live)
    preroll.fill(9)
    live.fill(9)
    await segmenter.end()

    const wav = mai.batch.mock.calls[0]?.[0].wav
    expect(wav && Array.from(new Int16Array(wav.slice(44).buffer))).toEqual([1, 2, 3, 4, 5])
  })

  it('uses the streaming final when the batch call fails', async () => {
    const mai = fakeMai(
      [session([{ type: 'transcript-final', text: 'I need water' }])],
      [() => Promise.reject(new Error('503'))],
    )
    const { segmenter, summary } = harness(mai)

    segmenter.start([pcm()])
    await tick()
    await segmenter.end()

    expect(summary()).toEqual([
      [START_OF_SPEECH],
      [FINAL_TRANSCRIPT, 'I need water', 'en'],
      [END_OF_SPEECH, 'I need water', 'en'],
    ])
  })

  it('still finalizes when the streaming session fails (START just before FINAL)', async () => {
    const mai = fakeMai(
      [session([{ type: 'error', error: new Error('service_unavailable_error') }])],
      [async () => ({ text: '담요 주세요', language: 'ko' })],
    )
    const { segmenter, summary } = harness(mai)

    segmenter.start([pcm()])
    await segmenter.end()

    expect(summary()).toEqual([
      [START_OF_SPEECH],
      [FINAL_TRANSCRIPT, '담요 주세요', 'ko'],
      [END_OF_SPEECH, '담요 주세요', 'ko'],
    ])
  })

  it('keeps recording after a failed session cancels its audio stream', async () => {
    const batch = vi.fn<MaiTranscribers['batch']>(async () => ({ text: 'water', language: 'en' }))
    const transcribers: MaiTranscribers = {
      async *stream({ audio }) {
        await audio.cancel() // what the gateway does when the provider fails
        yield { type: 'error', error: new Error('service_unavailable_error') }
      },
      batch,
    }
    const { segmenter, summary } = harness(transcribers)

    segmenter.start([new Int16Array([1])])
    await tick()
    expect(() => segmenter.audio(new Int16Array([2]))).not.toThrow()
    await segmenter.end()

    const wav = batch.mock.calls[0]?.[0].wav
    expect(wav && Array.from(new Int16Array(wav.slice(44).buffer))).toEqual([1, 2])
    expect(summary()).toEqual([
      [START_OF_SPEECH],
      [FINAL_TRANSCRIPT, 'water', 'en'],
      [END_OF_SPEECH, 'water', 'en'],
    ])
  })

  it('emits nothing for an utterance with no words', async () => {
    const mai = fakeMai([session([])], [async () => ({ text: '  ' })])
    const { segmenter, events } = harness(mai)

    segmenter.start([pcm()])
    await segmenter.end()

    expect(events).toEqual([])
  })

  it('closes a started utterance with END when it ends up with no transcript', async () => {
    const mai = fakeMai(
      [session([{ type: 'transcript-partial', text: 'uh' }])],
      [async () => ({ text: '' })],
    )
    const { segmenter, summary } = harness(mai)

    segmenter.start([pcm()])
    await tick()
    await segmenter.end()

    expect(summary()).toEqual([[START_OF_SPEECH], [INTERIM_TRANSCRIPT, 'uh', ''], [END_OF_SPEECH]])
  })

  it('never emits the next utterance before the previous FINAL and END', async () => {
    const firstBatch = deferred<{ text: string; language?: string }>()
    const mai = fakeMai(
      [session([]), session([{ type: 'transcript-partial', text: 'and a pillow' }])],
      [() => firstBatch.promise, async () => ({ text: 'and a pillow', language: 'en' })],
    )
    const { segmenter, summary } = harness(mai)

    segmenter.start([pcm()])
    const first = segmenter.end()
    segmenter.start([pcm()])
    await tick()
    expect(summary()).toEqual([])

    firstBatch.resolve({ text: 'A blanket', language: 'en' })
    await first
    await tick()
    await segmenter.end()

    expect(summary()).toEqual([
      [START_OF_SPEECH],
      [FINAL_TRANSCRIPT, 'A blanket', 'en'],
      [END_OF_SPEECH, 'A blanket', 'en'],
      [START_OF_SPEECH],
      [INTERIM_TRANSCRIPT, 'and a pillow', ''],
      [FINAL_TRANSCRIPT, 'and a pillow', 'en'],
      [END_OF_SPEECH, 'and a pillow', 'en'],
    ])
  })

  it('reports a connection error after three utterances in a row produce nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const failing = () => Promise.reject(new Error('unavailable'))
      const mai = fakeMai([session([]), session([]), session([])], [failing, failing, failing])
      const { segmenter, onRepeatedFailure } = harness(mai)

      for (let i = 0; i < 3; i++) {
        segmenter.start([pcm()])
        const ended = segmenter.end()
        await vi.advanceTimersByTimeAsync(2000)
        await ended
      }

      expect(onRepeatedFailure).toHaveBeenCalledTimes(1)
      expect(onRepeatedFailure.mock.calls[0]?.[0]).toMatchObject({ name: 'APIConnectionError' })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('MaiSegmenter speculative batch and race', () => {
  it('starts the batch call during the pause and uses it at commit', async () => {
    const mai = fakeMai([session([])], [async () => ({ text: 'A blanket', language: 'en' })])
    const { segmenter, summary } = harness(mai)

    segmenter.start([new Int16Array([1, 2])])
    segmenter.speculate()
    segmenter.audio(new Int16Array([0, 0])) // the rest of the silence wait
    await segmenter.end()

    expect(mai.batch).toHaveBeenCalledTimes(1)
    const wav = mai.batch.mock.calls[0]?.[0].wav
    // speculated on the audio up to the pause
    expect(wav && Array.from(new Int16Array(wav.slice(44).buffer))).toEqual([1, 2])
    expect(summary()).toEqual([
      [START_OF_SPEECH],
      [FINAL_TRANSCRIPT, 'A blanket', 'en'],
      [END_OF_SPEECH, 'A blanket', 'en'],
    ])
  })

  it('drops the speculative call when speech resumes, and calls again on all the audio', async () => {
    let firstSignal: AbortSignal | undefined
    const mai = fakeMai(
      [session([])],
      [async () => ({ text: 'A blanket and water', language: 'en' })],
    )
    // the first (speculative) call never answers and must be dropped
    mai.batch.mockImplementationOnce(({ abortSignal }) => {
      firstSignal = abortSignal
      return new Promise(() => {})
    })
    const { segmenter, summary } = harness(mai)

    segmenter.start([new Int16Array([1])])
    segmenter.speculate()
    segmenter.resumed()
    segmenter.audio(new Int16Array([2]))
    await segmenter.end()

    expect(firstSignal?.aborted).toBe(true)
    expect(mai.batch).toHaveBeenCalledTimes(2)
    const wav = mai.batch.mock.calls[1]?.[0].wav
    expect(wav && Array.from(new Int16Array(wav.slice(44).buffer))).toEqual([1, 2])
    expect(summary().at(-2)).toEqual([FINAL_TRANSCRIPT, 'A blanket and water', 'en'])
  })

  it('takes the streaming final when it beats the batch call (language from the text)', async () => {
    const slowBatch = deferred<{ text: string; language?: string }>()
    const mai = fakeMai(
      [session([{ type: 'transcript-final', text: '一杯水。' }])],
      [() => slowBatch.promise],
    )
    const { segmenter, summary } = harness(mai)

    segmenter.start([pcm()])
    await tick()
    await segmenter.end()

    expect(summary()).toEqual([
      [START_OF_SPEECH],
      [FINAL_TRANSCRIPT, '一杯水。', 'zh'],
      [END_OF_SPEECH, '一杯水。', 'zh'],
    ])
    slowBatch.resolve({ text: '一杯水。', language: 'zh' })
  })

  it('does not wait for a streaming session that hangs or fails', async () => {
    const neverEnds = new Promise<void>(() => {})
    const mai = fakeMai(
      [session([{ type: 'transcript-partial', text: 'some wa' }], neverEnds)],
      [async () => ({ text: 'Some water', language: 'en' })],
    )
    const { segmenter, summary } = harness(mai)

    segmenter.start([pcm()])
    await tick()
    await segmenter.end()

    expect(summary().slice(-2)).toEqual([
      [FINAL_TRANSCRIPT, 'Some water', 'en'],
      [END_OF_SPEECH, 'Some water', 'en'],
    ])
  })

  it('keeps the session language for a short utterance detected as another language', async () => {
    const mai = fakeMai(
      [session([]), session([])],
      [
        async () => ({ text: 'Necesito una manta extra, por favor', language: 'es' }),
        async () => ({ text: 'Okay', language: 'en' }),
      ],
    )
    const { segmenter, summary } = harness(mai)

    segmenter.start([pcm()])
    await segmenter.end()
    segmenter.start([pcm()])
    await segmenter.end()

    expect(summary().at(-1)).toEqual([END_OF_SPEECH, 'Okay', 'es'])
  })
})

describe('resolveUtteranceLanguage', () => {
  it('trusts the script over the detected language', () => {
    expect(resolveUtteranceLanguage({ text: '一杯水。', detected: 'en' })).toEqual({
      language: 'zh',
      confident: true,
    })
    expect(resolveUtteranceLanguage({ text: '물 주세요', detected: 'en', last: 'es' })).toEqual({
      language: 'ko',
      confident: true,
    })
  })

  it('keeps the last language for a short Latin-script utterance that disagrees', () => {
    expect(resolveUtteranceLanguage({ text: 'Okay', detected: 'en', last: 'es' })).toEqual({
      language: 'es',
      confident: false,
    })
  })

  it('switches language on a longer utterance', () => {
    expect(
      resolveUtteranceLanguage({
        text: 'Could I get another blanket please',
        detected: 'en',
        last: 'es',
      }),
    ).toEqual({ language: 'en', confident: true })
  })

  it('uses the detected language for a first short utterance, without trusting it yet', () => {
    expect(resolveUtteranceLanguage({ text: 'Water', detected: 'en' })).toEqual({
      language: 'en',
      confident: false,
    })
  })

  it('measures short utterances in CJK characters or words', () => {
    expect(isShortUtterance('一杯水。')).toBe(true)
    expect(isShortUtterance('我需要一条毯子')).toBe(false)
    expect(isShortUtterance('Yes please')).toBe(true)
    expect(isShortUtterance('Some more water')).toBe(false)
  })
})

describe('interruptionWords', () => {
  it('needs 2 words, except for CJK where the duration does it', () => {
    expect(interruptionWords('en')).toBe(2)
    expect(interruptionWords(undefined)).toBe(2)
    expect(interruptionWords('zh')).toBe(0)
    expect(interruptionWords('ko-KR')).toBe(0)
  })
})

describe('language codes', () => {
  it('maps room languages to MAI hints', () => {
    expect(maiLanguageHint('auto')).toBeUndefined()
    expect(maiLanguageHint('es')).toBe('es')
    expect(maiLanguageHint('tl')).toBe('fil')
    expect(maiLanguageHint('ht')).toBeUndefined()
  })

  it('maps MAI languages to board codes', () => {
    expect(boardLanguage('fil')).toBe('tl')
    expect(boardLanguage('zh-CN')).toBe('zh')
    expect(boardLanguage(undefined)).toBeUndefined()
  })
})

describe('pcmToWav', () => {
  it('writes a 16 kHz mono 16-bit WAV header', () => {
    const wav = pcmToWav(new Int16Array([1, -1]))
    const view = new DataView(wav.buffer)
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF')
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(40, true)).toBe(4)
    expect(wav.byteLength).toBe(48)
  })
})
