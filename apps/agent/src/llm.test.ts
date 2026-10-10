import { describe, expect, it, vi } from 'vitest'
import { type HedgeOutcome, hedgeStream } from './llm'

interface Timed {
  at: number
  value?: string
  error?: Error
}

/** A stream that emits each item at its time (ms after creation), then closes. */
function timedStream(items: Timed[]) {
  const timers: ReturnType<typeof setTimeout>[] = []
  const cancelled = { value: false }
  const stream = new ReadableStream<string>({
    start(controller) {
      for (const item of items) {
        timers.push(
          setTimeout(() => {
            if (item.error) controller.error(item.error)
            else if (item.value !== undefined) controller.enqueue(item.value)
          }, item.at),
        )
      }
      const last = Math.max(0, ...items.map((i) => i.at))
      timers.push(
        setTimeout(() => {
          try {
            controller.close()
          } catch {
            // already errored or cancelled
          }
        }, last + 1),
      )
    },
    cancel() {
      cancelled.value = true
      for (const timer of timers) clearTimeout(timer)
    },
  })
  return { stream, cancelled }
}

async function readAll(stream: ReadableStream<string> | null): Promise<string[]> {
  const out: string[] = []
  if (!stream) return out
  for await (const chunk of stream) out.push(chunk)
  return out
}

/** Real chunks are non-empty strings; "" stands in for a usage-only chunk. */
const isFirstChunk = (chunk: string) => chunk.length > 0

function run(attempts: Timed[][], afterMs: number) {
  const made = attempts.map((items) => timedStream(items))
  let next = 0
  const start = vi.fn(async (_attempt: 'primary' | 'hedge') => made[next++]?.stream ?? null)
  const outcomes: HedgeOutcome[] = []
  const result = hedgeStream(start, {
    afterMs,
    isFirstChunk,
    onSettled: (outcome) => outcomes.push(outcome),
  })
  return { made, start, outcomes, result }
}

describe('hedgeStream', () => {
  it('does not hedge a request that answers in time', async () => {
    const { start, outcomes, result } = run(
      [
        [
          { at: 5, value: 'Got it' },
          { at: 10, value: ', sending that.' },
        ],
      ],
      100,
    )

    expect(await readAll(await result)).toEqual(['Got it', ', sending that.'])
    expect(start).toHaveBeenCalledTimes(1)
    expect(outcomes).toEqual([
      { fired: false, winner: 'primary', firstChunkMs: expect.any(Number) },
    ])
  })

  it('races a second request when the first is slow, and forwards only the winner', async () => {
    const { made, start, outcomes, result } = run(
      [
        [{ at: 400, value: 'primary (slow)' }],
        [
          { at: 10, value: 'hedge' },
          { at: 20, value: ' reply' },
        ],
      ],
      50,
    )

    expect(await readAll(await result)).toEqual(['hedge', ' reply'])
    expect(start).toHaveBeenCalledTimes(2)
    expect(made[0]?.cancelled.value).toBe(true)
    expect(outcomes[0]).toMatchObject({ fired: true, winner: 'hedge' })
  })

  it('tells start() which attempt it is, so each can be routed differently', async () => {
    const { start, result } = run([[{ at: 400, value: 'slow' }], [{ at: 10, value: 'fast' }]], 50)
    expect(await readAll(await result)).toEqual(['fast'])
    expect(start.mock.calls).toEqual([['primary'], ['hedge']])
  })

  it('keeps the first request when it still answers before the hedge', async () => {
    const { made, outcomes, result } = run(
      [[{ at: 80, value: 'primary' }], [{ at: 400, value: 'hedge (slow)' }]],
      50,
    )

    expect(await readAll(await result)).toEqual(['primary'])
    expect(made[1]?.cancelled.value).toBe(true)
    expect(outcomes[0]).toMatchObject({ fired: true, winner: 'primary' })
  })

  it('never hedges when turned off (0)', async () => {
    const { start, outcomes, result } = run([[{ at: 120, value: 'slow' }], []], 0)

    expect(await readAll(await result)).toEqual(['slow'])
    expect(start).toHaveBeenCalledTimes(1)
    expect(outcomes[0]).toMatchObject({ fired: false, winner: 'primary' })
  })

  it('replays chunks that came before the first real one', async () => {
    const { result } = run(
      [
        [
          { at: 5, value: '' },
          { at: 10, value: 'text' },
        ],
      ],
      100,
    )
    expect(await readAll(await result)).toEqual(['', 'text'])
  })

  it('counts an empty reply as an answer (no hedge after it ends)', async () => {
    const { start, outcomes, result } = run([[]], 100)
    expect(await readAll(await result)).toEqual([])
    expect(start).toHaveBeenCalledTimes(1)
    expect(outcomes[0]).toMatchObject({ fired: false, winner: 'primary' })
  })

  it('uses the hedge when the first request fails after the hedge fired', async () => {
    const { result } = run(
      [[{ at: 80, error: new Error('503') }], [{ at: 120, value: 'hedge' }]],
      50,
    )
    expect(await readAll(await result)).toEqual(['hedge'])
  })

  it('rethrows an error that comes before the hedge would fire', async () => {
    const { result } = run([[{ at: 5, error: new Error('400 bad request') }]], 100)
    await expect(result).rejects.toThrow('400 bad request')
  })
})
