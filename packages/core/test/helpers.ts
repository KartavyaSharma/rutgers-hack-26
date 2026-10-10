import { Effect, Layer, Stream } from 'effect'
import { AiError, LanguageModel, type Prompt } from 'effect/ai'
import type { RoutingDecision } from '../src'

/** What the mock model saw for one call. */
export interface ModelCall {
  readonly system: string
  /** The patient's text, extracted from the user message. */
  readonly patientText: string
}

export const decision = (overrides: Partial<RoutingDecision> = {}): RoutingDecision => ({
  team: 'care_aide',
  category: 'blanket',
  urgency: 'routine',
  clinical: false,
  confidence: 0.95,
  staffSummary: 'Patient requests another blanket',
  patientReply: 'An extra blanket.',
  language: 'en',
  ...overrides,
})

const messageText = (message: Prompt.Message): string => {
  if (message.role === 'system') return message.content
  if (message.role === 'user') {
    return message.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
  }
  return ''
}

const toCall = (prompt: Prompt.Prompt): ModelCall => {
  const system = prompt.content
    .filter((m) => m.role === 'system')
    .map(messageText)
    .join('\n')
  const user = prompt.content
    .filter((m) => m.role === 'user')
    .map(messageText)
    .join('\n')
  const quoted = /"""\n([\s\S]*)\n"""/.exec(user)
  return { system, patientText: quoted?.[1] ?? user }
}

/**
 * A real LanguageModel service (structured output decoding included) whose provider call is
 * replaced by `respond`, which returns the raw text the model "said".
 */
export const mockModel = (respond: (call: ModelCall) => Effect.Effect<string, AiError.AiError>) => {
  const calls: Array<ModelCall> = []
  const layer = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: (options) =>
        Effect.suspend(() => {
          const call = toCall(options.prompt)
          calls.push(call)
          return respond(call)
        }).pipe(Effect.map((text) => [{ type: 'text' as const, text }])),
      streamText: () => Stream.die(new Error('streamText is not used by the router')),
    }),
  )
  return { layer, calls }
}

/** Mock model that answers with a fixed decision per patient text. */
export const scriptedModel = (script: Readonly<Record<string, RoutingDecision>>) =>
  mockModel((call) => {
    const answer = script[call.patientText]
    return answer === undefined
      ? Effect.die(new Error(`no scripted answer for: ${call.patientText}`))
      : Effect.succeed(JSON.stringify(answer))
  })

export const aiError = (reason: AiError.AiErrorReason): AiError.AiError =>
  AiError.make({ module: 'Test', method: 'generateText', reason })
