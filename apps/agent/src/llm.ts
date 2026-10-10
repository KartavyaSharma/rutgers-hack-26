// The conversation LLM: Cerebras through the LiveKit Cerebras plugin, which is the OpenAI plugin's
// LLM with msgpack + gzip request bodies. Neither plugin's options can set `reasoning_effort` for a
// non-OpenAI model (the OpenAI plugin only defaults it for gpt-5*), so this subclass adds it to
// every request through `chat({ extraKwargs })`: the OpenAI plugin copies extraKwargs into the
// request options and LiveKit spreads them into the chat.completions body. The framework's own
// llm.chat() call passes no extraKwargs, so nothing is overwritten.
import * as cerebras from '@livekit/agents-plugin-cerebras'
import type { ReasoningEffort } from './env'

type ChatParams = Parameters<cerebras.LLM['chat']>[0]

export class ConversationLLM extends cerebras.LLM {
  readonly #reasoningEffort: ReasoningEffort

  constructor(opts: { apiKey: string; model: string; reasoningEffort: ReasoningEffort }) {
    // Parallel tool calls on: "a pillow and some water" is two send_request calls in one reply,
    // and tools return no output, so there is no second step in which to make the other call.
    super({ apiKey: opts.apiKey, model: opts.model, parallelToolCalls: true })
    this.#reasoningEffort = opts.reasoningEffort
  }

  override chat(params: ChatParams): ReturnType<cerebras.LLM['chat']> {
    return super.chat({
      ...params,
      extraKwargs: { ...params.extraKwargs, reasoning_effort: this.#reasoningEffort },
    })
  }
}

/** Start a second, identical request when the first has produced nothing after this long. */
export const DEFAULT_HEDGE_AFTER_MS = 900

export interface HedgeOutcome {
  /** Whether the second request was started. */
  fired: boolean
  winner: 'primary' | 'hedge'
  /** Time from the call to the winner's first real chunk (or its end, for an empty reply). */
  firstChunkMs: number
}

interface Attempt<T> {
  name: 'primary' | 'hedge'
  reader: ReadableStreamDefaultReader<T>
  /** Chunks read before the first real one (e.g. usage-only), replayed to the consumer. */
  buffered: T[]
  /** Settles when the first real chunk is buffered or the stream ends; rejects on error. */
  first: Promise<void>
}

/**
 * Hedged request: `start()` opens one LLM response stream. If the first has not produced a real
 * chunk (content or a tool call, per `isFirstChunk`) within `afterMs`, an identical second one
 * starts; whichever produces its first chunk first is forwarded and the other is cancelled, so
 * tool calls are never duplicated. `afterMs <= 0` turns hedging off (timing is still reported).
 * An error before the hedge fires is rethrown; after it, the other attempt still gets its chance.
 */
export async function hedgeStream<T>(
  start: () => Promise<ReadableStream<T> | null>,
  options: {
    afterMs: number
    isFirstChunk: (chunk: T) => boolean
    onSettled?: (outcome: HedgeOutcome) => void
  },
): Promise<ReadableStream<T> | null> {
  const t0 = performance.now()
  const open = (name: Attempt<T>['name'], stream: ReadableStream<T>): Attempt<T> => {
    const reader = stream.getReader()
    const buffered: T[] = []
    const first = (async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        buffered.push(value)
        if (options.isFirstChunk(value)) return
      }
    })()
    return { name, reader, buffered, first }
  }
  const settle = (attempt: Attempt<T>) =>
    attempt.first.then(
      () => ({ attempt, error: undefined as unknown }),
      (error: unknown) => ({ attempt, error }),
    )

  const firstStream = await start()
  if (!firstStream) return firstStream
  const primary = open('primary', firstStream)

  let timer: ReturnType<typeof setTimeout> | undefined
  const hedgeDue =
    options.afterMs > 0
      ? new Promise<'hedge'>((resolve) => {
          timer = setTimeout(() => resolve('hedge'), options.afterMs)
        })
      : new Promise<'hedge'>(() => {})
  const early = await Promise.race([settle(primary), hedgeDue])
  if (timer !== undefined) clearTimeout(timer)

  let winner: Attempt<T>
  let fired = false
  if (early !== 'hedge') {
    if (early.error !== undefined) throw early.error
    winner = primary
  } else {
    fired = true
    let second: ReadableStream<T> | null = null
    try {
      second = await start()
    } catch {
      // the hedge could not start; keep waiting on the first request
    }
    if (!second) {
      await primary.first
      winner = primary
    } else {
      const hedge = open('hedge', second)
      const firstSettled = await Promise.race([settle(primary), settle(hedge)])
      let chosen = firstSettled
      if (firstSettled.error !== undefined) {
        // that one failed: the other one is the answer (or its error is)
        const other = firstSettled.attempt === primary ? hedge : primary
        chosen = await settle(other)
        if (chosen.error !== undefined) throw chosen.error
      }
      winner = chosen.attempt
      const loser = winner === primary ? hedge : primary
      loser.reader.cancel().catch(() => {})
    }
  }

  options.onSettled?.({ fired, winner: winner.name, firstChunkMs: performance.now() - t0 })

  const { reader, buffered } = winner
  return new ReadableStream<T>({
    async pull(controller) {
      const next = buffered.shift()
      if (next !== undefined) {
        controller.enqueue(next)
        return
      }
      try {
        const { done, value } = await reader.read()
        if (done) controller.close()
        else controller.enqueue(value)
      } catch (error) {
        controller.error(error)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}
