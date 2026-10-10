import { Schema } from 'effect'
import type { AiError } from 'effect/ai'

/** No API key: the router never touches the network. */
export class RouterNotConfigured extends Schema.TaggedError<RouterNotConfigured>()(
  'RouterNotConfigured',
  { message: Schema.String },
) {}

/** The model call (including client setup) took longer than the router timeout. */
export class RouterTimeout extends Schema.TaggedError<RouterTimeout>()('RouterTimeout', {
  timeoutMs: Schema.Finite,
}) {}

/** 429 from the provider (rate limit or exhausted quota). */
export class RouterRateLimited extends Schema.TaggedError<RouterRateLimited>()(
  'RouterRateLimited',
  { message: Schema.String },
) {}

/** The model answered, but not with a valid routing decision (bad JSON, schema mismatch, out of range). */
export class RouterInvalidOutput extends Schema.TaggedError<RouterInvalidOutput>()(
  'RouterInvalidOutput',
  { message: Schema.String },
) {}

/** Any other failure talking to the model: HTTP error, network error, auth, provider outage. */
export class RouterModelFailure extends Schema.TaggedError<RouterModelFailure>()(
  'RouterModelFailure',
  { message: Schema.String },
) {}

/**
 * Every typed failure the router can produce. `recoverRouterErrors` in router.ts must handle
 * each of these; adding a member here without a handler there is a compile error.
 */
export type RouterError =
  | RouterNotConfigured
  | RouterTimeout
  | RouterRateLimited
  | RouterInvalidOutput
  | RouterModelFailure

type AiFailureKind = 'rate_limited' | 'invalid_output' | 'error'

// Typed as a full record over Effect's AiErrorReason tags, so a new reason in a future
// effect version shows up here as a compile error instead of silently becoming "error".
const AI_FAILURE_KIND: { readonly [K in AiError.AiErrorReason['_tag']]: AiFailureKind } = {
  RateLimitError: 'rate_limited',
  QuotaExhaustedError: 'rate_limited',
  AuthenticationError: 'error',
  ContentPolicyError: 'error',
  InvalidRequestError: 'error',
  InternalProviderError: 'error',
  NetworkError: 'error',
  InvalidOutputError: 'invalid_output',
  StructuredOutputError: 'invalid_output',
  UnsupportedSchemaError: 'error',
  UnknownError: 'error',
  ToolNotFoundError: 'invalid_output',
  ToolParameterValidationError: 'invalid_output',
  InvalidToolResultError: 'error',
  ToolResultEncodingError: 'error',
  ToolConfigurationError: 'error',
  ToolkitRequiredError: 'error',
  InvalidUserInputError: 'error',
}

/** Translate Effect AI's error into the router's own tagged errors. */
export const fromAiError = (
  error: AiError.AiError,
): RouterRateLimited | RouterInvalidOutput | RouterModelFailure => {
  const message = `${error.reason._tag}: ${error.message}`
  switch (AI_FAILURE_KIND[error.reason._tag]) {
    case 'rate_limited':
      return new RouterRateLimited({ message })
    case 'invalid_output':
      return new RouterInvalidOutput({ message })
    case 'error':
      return new RouterModelFailure({ message })
  }
}
