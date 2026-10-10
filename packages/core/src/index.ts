export * from './taxonomy'

import { Effect } from 'effect'
import {
  CEREBRAS_BASE_URL,
  type CerebrasOptions,
  DEFAULT_CEREBRAS_MODEL,
  makeCerebrasLayer,
} from './cerebras'
import {
  CLINICAL_THRESHOLD,
  type ClassifyInput,
  type ClassifyOptions,
  classifyRequestEffect,
  isClinicalAnswer,
  NURSE_CLINICAL_THRESHOLD,
} from './classify'
import { nurseFallback } from './fallback'
import {
  DEFAULT_JEV_MODEL,
  JEV_QUESTIONS,
  Jev,
  type JevAnswers,
  type JevLayer,
  type JevOptions,
  makeJevLayer,
  TYPESAFE_API_BASE,
} from './jev'
import {
  CONFIDENCE_THRESHOLD,
  ROUTER_TIMEOUT_MS,
  type RouterModelLayer,
  type RouterOptions,
  routeTextEffect,
} from './router'
import type { RouteResult } from './taxonomy'

export {
  type RouterError,
  RouterInvalidOutput,
  RouterModelFailure,
  RouterNotConfigured,
  RouterRateLimited,
  RouterTimeout,
} from './errors'
export { canonicalLanguage, guessLanguage } from './language'
export {
  HELP_BUTTON_LABELS,
  helpButtonLabel,
  PATIENT_MESSAGE_KEYS,
  type PatientMessageKey,
  patientMessage,
  quotePatientWords,
} from './messages'
export { detectRedFlag, RED_FLAG_LABELS, type RedFlagCategory, type RedFlagMatch } from './redFlags'
export {
  CEREBRAS_BASE_URL,
  type CerebrasOptions,
  CLINICAL_THRESHOLD,
  type ClassifyInput,
  type ClassifyOptions,
  CONFIDENCE_THRESHOLD,
  classifyRequestEffect,
  DEFAULT_CEREBRAS_MODEL,
  DEFAULT_JEV_MODEL,
  isClinicalAnswer,
  JEV_QUESTIONS,
  Jev,
  type JevAnswers,
  type JevLayer,
  type JevOptions,
  makeCerebrasLayer,
  makeJevLayer,
  NURSE_CLINICAL_THRESHOLD,
  ROUTER_TIMEOUT_MS,
  type RouterModelLayer,
  type RouterOptions,
  routeTextEffect,
  TYPESAFE_API_BASE,
}

export interface RouteTextOptions extends CerebrasOptions, RouterOptions {}

export interface ClassifyRequestOptions extends JevOptions, ClassifyOptions {}

const env = (name: string): string | undefined => {
  const value = globalThis.process?.env?.[name]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

/** Used only if something throws outside the Effect program. Never throws itself. */
const lastResort = (text: unknown): RouteResult => {
  try {
    return nurseFallback(typeof text === 'string' ? text : '', 'error')
  } catch {
    return {
      team: 'nurse',
      category: 'unrouted',
      urgency: 'soon',
      clinical: false,
      confidence: 0,
      staffSummary: 'Patient request (router error)',
      patientReply: 'Your nurse is on the way.',
      language: 'en',
      reason: 'error',
    }
  }
}

/** Run a never-failing router program; anything that still escapes becomes lastResort. */
const runSafely = (
  program: () => Effect.Effect<RouteResult>,
  text: unknown,
): Promise<RouteResult> => {
  try {
    return Effect.runPromise(program()).catch(() => lastResort(text))
  } catch {
    return Promise.resolve(lastResort(text))
  }
}

const run = (text: string, layer: RouterModelLayer, options: RouterOptions): Promise<RouteResult> =>
  runSafely(() => routeTextEffect(text, layer, options), text)

const textOf = (input: unknown): unknown =>
  typeof input === 'object' && input !== null ? (input as { text?: unknown }).text : undefined

const runClassify = (
  input: ClassifyInput,
  layer: JevLayer,
  options: ClassifyOptions,
): Promise<RouteResult> =>
  runSafely(() => classifyRequestEffect(input, layer, options), textOf(input))

/**
 * Route a typed or spoken patient message to a team. Never rejects: every failure
 * (no key, timeout, HTTP error, bad output, thrown exception) becomes a nurse decision.
 *
 * Reads CEREBRAS_API_KEY and CEREBRAS_MODEL from the environment unless passed in `options`.
 */
export async function routeText(
  text: string,
  options: RouteTextOptions = {},
): Promise<RouteResult> {
  try {
    const layer = makeCerebrasLayer({
      apiKey: options.apiKey ?? env('CEREBRAS_API_KEY'),
      model: options.model ?? env('CEREBRAS_MODEL') ?? DEFAULT_CEREBRAS_MODEL,
      baseUrl: options.baseUrl ?? CEREBRAS_BASE_URL,
      fetch: options.fetch,
    })
    return await run(text, layer, options)
  } catch {
    return lastResort(text)
  }
}

/**
 * Build a routeText() bound to a specific LanguageModel layer (e.g. a mock in tests).
 * Same guarantees as routeText(): the returned function never rejects.
 */
export function makeRouteText(
  layer: RouterModelLayer,
  defaults: RouterOptions = {},
): (text: string, options?: RouterOptions) => Promise<RouteResult> {
  return async (text, options = {}) => {
    try {
      return await run(text, layer, { ...defaults, ...options })
    } catch {
      return lastResort(text)
    }
  }
}

/**
 * Classify a typed or spoken patient request with Jev (TypeSafe AI). Never rejects: every
 * failure (no key, timeout, 429/529, HTTP error, bad response, thrown exception) becomes a nurse
 * decision with its reason.
 *
 * Reads TYPESAFE_API_KEY, TYPESAFE_MODEL and TYPESAFE_API_BASE from the environment unless
 * passed in `options`. `input.readBack` and `input.staffSummary` (e.g. from the voice agent's
 * LLM) are used where they apply; see classify.ts.
 */
export async function classifyRequest(
  input: ClassifyInput,
  options: ClassifyRequestOptions = {},
): Promise<RouteResult> {
  try {
    const layer = makeJevLayer({
      apiKey: options.apiKey ?? env('TYPESAFE_API_KEY'),
      model: options.model ?? env('TYPESAFE_MODEL') ?? DEFAULT_JEV_MODEL,
      baseUrl: options.baseUrl ?? env('TYPESAFE_API_BASE') ?? TYPESAFE_API_BASE,
      fetch: options.fetch,
    })
    return await runClassify(input, layer, options)
  } catch {
    return lastResort(textOf(input))
  }
}

/**
 * Build a classifyRequest() bound to a specific Jev layer (e.g. a mock in tests).
 * Same guarantees as classifyRequest(): the returned function never rejects.
 */
export function makeClassifyRequest(
  layer: JevLayer,
  defaults: ClassifyOptions = {},
): (input: ClassifyInput, options?: ClassifyOptions) => Promise<RouteResult> {
  return async (input, options = {}) => {
    try {
      return await runClassify(input, layer, { ...defaults, ...options })
    } catch {
      return lastResort(textOf(input))
    }
  }
}
