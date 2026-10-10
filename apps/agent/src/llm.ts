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
    // One tool call per step keeps confirm/cancel/classify ordered as the model decided.
    super({ apiKey: opts.apiKey, model: opts.model, parallelToolCalls: false })
    this.#reasoningEffort = opts.reasoningEffort
  }

  override chat(params: ChatParams): ReturnType<cerebras.LLM['chat']> {
    return super.chat({
      ...params,
      extraKwargs: { ...params.extraKwargs, reasoning_effort: this.#reasoningEffort },
    })
  }
}
