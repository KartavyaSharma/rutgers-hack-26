// The routing program. Effect lives here and in cerebras.ts only; index.ts exposes plain promises.
import { Cause, Duration, Effect, type Layer, Schema } from 'effect'
import { LanguageModel } from 'effect/ai'
import {
  fromAiError,
  type RouterError,
  RouterInvalidOutput,
  type RouterModelFailure,
  type RouterNotConfigured,
  type RouterRateLimited,
  RouterTimeout,
} from './errors'
import {
  type FallbackReason,
  isSafeReadBack,
  nurseFallback,
  quoteForStaff,
  redFlagResult,
  withPatientReply,
} from './fallback'
import { normalizeLanguageCode, oneLine } from './language'
import { quotePatientWords } from './messages'
import { buildPrompt } from './prompt'
import { detectRedFlag } from './redFlags'
import { ModelRoutingDecision, RoutingDecisionSchema } from './schema'
import {
  isLanguageCode,
  type LanguageCode,
  type LanguagePreference,
  type RouteResult,
  type RoutingDecision,
} from './taxonomy'

/** Hard limit for the model call (client setup included). Slower than this goes to the nurse. */
export const ROUTER_TIMEOUT_MS = 2000

/** Model decisions below this confidence go to the nurse. */
export const CONFIDENCE_THRESHOLD = 0.8

/** A LanguageModel provider. It may fail to build with RouterNotConfigured (no API key). */
export type RouterModelLayer = Layer.Layer<LanguageModel.LanguageModel, RouterNotConfigured>

export interface RouterOptions {
  /** Defaults to ROUTER_TIMEOUT_MS. */
  readonly timeoutMs?: number | undefined
  /**
   * The room's language setting. "auto" (the default) detects the patient's language.
   * A language code makes every reply (model, red flag, fallback) use that language and sets
   * the decision's `language` to it. Red-flag detection always runs on the raw text.
   */
  readonly language?: LanguagePreference | undefined
}

const decodeDecision = Schema.decodeUnknownEffect(RoutingDecisionSchema)

/** snake_case label for staff screens, e.g. "TV Remote!" -> "tv_remote". */
export const normalizeCategory = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'general'

/**
 * Tidy the model's free-text fields: one-line summary and read-back, clean codes.
 * A read-back that names a team or claims it was sent is replaced by the patient's own words.
 */
const tidyDecision = (
  text: string,
  decision: RoutingDecision,
  fixedLanguage: LanguageCode | undefined,
): RoutingDecision => {
  const language = fixedLanguage ?? normalizeLanguageCode(decision.language, text)
  const staffSummary = oneLine(decision.staffSummary, 160)
  const patientReply = oneLine(decision.patientReply, 240)
  return {
    team: decision.team,
    category: normalizeCategory(decision.category),
    urgency: decision.urgency,
    clinical: decision.clinical,
    confidence: decision.confidence,
    staffSummary: staffSummary.length > 0 ? staffSummary : quoteForStaff(text, language),
    patientReply: isSafeReadBack(patientReply) ? patientReply : quotePatientWords(text, language),
    language,
  }
}

/** Ask the model for a routing decision and validate it beyond what the JSON schema can express. */
export const classifyText = (
  text: string,
  fixedLanguage?: LanguageCode,
): Effect.Effect<
  RoutingDecision,
  RouterInvalidOutput | RouterRateLimited | RouterModelFailure,
  LanguageModel.LanguageModel
> =>
  LanguageModel.generateObject({
    prompt: buildPrompt(text, fixedLanguage),
    schema: ModelRoutingDecision,
    objectName: 'routing_decision',
  }).pipe(
    Effect.mapError(fromAiError),
    Effect.flatMap((response) =>
      decodeDecision(response.value).pipe(
        Effect.mapError((error) => new RouterInvalidOutput({ message: error.message })),
      ),
    ),
    Effect.map((decision) => tidyDecision(text, decision, fixedLanguage)),
  )

/**
 * Safety rules applied to a valid model decision, in order: clinical, then low confidence.
 * Clinical tells the patient "Your nurse is on the way."; low confidence goes to the nurse with
 * the patient's own words quoted, since the model's description may be wrong.
 */
export const applySafetyRules = (text: string, decision: RoutingDecision): RouteResult => {
  const { patientReply, ...rest } = decision
  if (decision.clinical)
    return withPatientReply({ ...rest, team: 'nurse', reason: 'clinical' }, text)
  if (decision.confidence < CONFIDENCE_THRESHOLD) {
    return withPatientReply({ ...rest, team: 'nurse', reason: 'low_confidence' }, text)
  }
  return withPatientReply({ ...rest, reason: 'model' }, text, patientReply)
}

const fallbackTo = (
  text: string,
  language: LanguageCode | undefined,
  reason: FallbackReason,
  detail: string,
) =>
  Effect.logWarning(`[bell/router] ${reason}: ${detail}`).pipe(
    Effect.as(nurseFallback(text, reason, language)),
  )

/**
 * Turn every typed router failure into a nurse decision. The return type says the error
 * channel is `never`: adding a RouterError member without a handler here fails to compile.
 */
const recoverRouterErrors =
  (text: string, language: LanguageCode | undefined) =>
  <R>(self: Effect.Effect<RouteResult, RouterError, R>): Effect.Effect<RouteResult, never, R> =>
    self.pipe(
      Effect.catchTags({
        RouterNotConfigured: () => Effect.succeed(nurseFallback(text, 'not_configured', language)),
        RouterTimeout: (error) =>
          fallbackTo(text, language, 'timeout', `no answer after ${error.timeoutMs}ms`),
        RouterRateLimited: (error) => fallbackTo(text, language, 'rate_limited', error.message),
        RouterInvalidOutput: (error) => fallbackTo(text, language, 'invalid_output', error.message),
        RouterModelFailure: (error) => fallbackTo(text, language, 'error', error.message),
      }),
    )

/**
 * Route one patient message. Never fails: the error channel is `never`, defects included.
 *
 * Order: empty input, red-flag phrases (no model call), then the model with a timeout,
 * then the clinical and confidence rules.
 */
export const routeTextEffect = (
  text: string,
  layer: RouterModelLayer,
  options: RouterOptions = {},
): Effect.Effect<RouteResult> => {
  const input = typeof text === 'string' ? text : ''
  const timeoutMs = options.timeoutMs ?? ROUTER_TIMEOUT_MS
  // Anything that isn't a known language code (including "auto") means auto-detect.
  const language = isLanguageCode(options.language) ? options.language : undefined

  const routed = Effect.suspend((): Effect.Effect<RouteResult, RouterError> => {
    if (input.trim().length === 0) {
      return Effect.succeed(nurseFallback(input, 'empty_input', language))
    }

    const redFlag = detectRedFlag(input)
    if (redFlag !== null) return Effect.succeed(redFlagResult(input, redFlag, language))

    return classifyText(input, language).pipe(
      Effect.map((decision) => applySafetyRules(input, decision)),
      Effect.provide(layer),
      Effect.timeoutOrElse({
        duration: Duration.millis(timeoutMs),
        orElse: () => Effect.fail(new RouterTimeout({ timeoutMs })),
      }),
    )
  })

  return routed.pipe(recoverToNurse(input, language))
}

/**
 * Every failure becomes a nurse decision: typed router errors (handled exhaustively), then
 * defects and anything else in the cause. The result can't fail.
 */
export const recoverToNurse =
  (text: string, language: LanguageCode | undefined) =>
  <R>(self: Effect.Effect<RouteResult, RouterError, R>): Effect.Effect<RouteResult, never, R> =>
    self.pipe(
      recoverRouterErrors(text, language),
      Effect.catchCause((cause) =>
        Effect.logError(`[bell/router] unexpected failure\n${Cause.pretty(cause)}`).pipe(
          Effect.as(nurseFallback(text, 'error', language)),
        ),
      ),
    )
