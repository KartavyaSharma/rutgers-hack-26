import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai-compat'
import { Effect, Layer, Redacted } from 'effect'
import { LanguageModel } from 'effect/ai'
import { FetchHttpClient } from 'effect/http'
import { RouterNotConfigured } from './errors'
import type { RouterModelLayer } from './router'

export const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1'
export const DEFAULT_CEREBRAS_MODEL = 'qwen-3.8-27b'

/**
 * Extra chat-completions body fields. The compat client forwards config keys it doesn't
 * recognise verbatim into the request body (see `extractCustomRequestProperties` in
 * @effect/ai-openai-compat), which is how `reasoning_effort` reaches Cerebras.
 * Reasoning defaults to "high" on this model; "none" keeps routing well under the timeout.
 */
export const CEREBRAS_REQUEST_CONFIG = {
  reasoning_effort: 'none',
  temperature: 0,
  max_output_tokens: 400,
} as const

export interface CerebrasOptions {
  /** Defaults to nothing here; routeText() falls back to the CEREBRAS_API_KEY env var. */
  readonly apiKey?: string | undefined
  readonly model?: string | undefined
  /** Defaults to CEREBRAS_BASE_URL. */
  readonly baseUrl?: string | undefined
  /** Custom fetch (tests, proxies). Defaults to globalThis.fetch. */
  readonly fetch?: typeof globalThis.fetch | undefined
}

/** LanguageModel layer for Cerebras. Without an API key it fails with RouterNotConfigured. */
export const makeCerebrasLayer = (options: CerebrasOptions): RouterModelLayer => {
  const apiKey = options.apiKey?.trim()
  if (apiKey === undefined || apiKey.length === 0) {
    return Layer.effect(
      LanguageModel.LanguageModel,
      Effect.fail(new RouterNotConfigured({ message: 'CEREBRAS_API_KEY is not set' })),
    )
  }
  const httpClient =
    options.fetch === undefined
      ? FetchHttpClient.layer
      : FetchHttpClient.layer.pipe(
          Layer.provide(Layer.succeed(FetchHttpClient.Fetch, options.fetch)),
        )
  return OpenAiLanguageModel.layer({
    model: options.model ?? DEFAULT_CEREBRAS_MODEL,
    config: CEREBRAS_REQUEST_CONFIG,
  }).pipe(
    Layer.provide(
      OpenAiClient.layer({
        apiKey: Redacted.make(apiKey),
        apiUrl: options.baseUrl ?? CEREBRAS_BASE_URL,
      }),
    ),
    Layer.provide(httpClient),
  )
}
