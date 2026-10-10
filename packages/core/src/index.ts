export * from './taxonomy'

import { Effect } from 'effect'
import {
  CEREBRAS_BASE_URL,
  type CerebrasOptions,
  DEFAULT_CEREBRAS_MODEL,
  makeCerebrasLayer,
} from './cerebras'
import { nurseFallback } from './fallback'
import {
  CONFIDENCE_THRESHOLD,
  ROUTER_TIMEOUT_MS,
  type RouterModelLayer,
  type RouterOptions,
  routeTextEffect,
} from './router'
import type { RouteResult } from './taxonomy'

export { RouterNotConfigured } from './errors'
export {
  type Confirmation,
  classifyConfirmation,
  draftReadBack,
  PATIENT_MESSAGE_KEYS,
  type PatientMessageKey,
  patientMessage,
  quotePatientWords,
} from './messages'
export { detectRedFlag, RED_FLAG_LABELS, type RedFlagCategory, type RedFlagMatch } from './redFlags'
export {
  CEREBRAS_BASE_URL,
  type CerebrasOptions,
  CONFIDENCE_THRESHOLD,
  DEFAULT_CEREBRAS_MODEL,
  makeCerebrasLayer,
  ROUTER_TIMEOUT_MS,
  type RouterModelLayer,
  type RouterOptions,
  routeTextEffect,
}

export interface RouteTextOptions extends CerebrasOptions, RouterOptions {}

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
      patientReply: "I've let your nurse know.",
      language: 'en',
      reason: 'error',
    }
  }
}

const run = (
  text: string,
  layer: RouterModelLayer,
  options: RouterOptions,
): Promise<RouteResult> => {
  try {
    return Effect.runPromise(routeTextEffect(text, layer, options)).catch(() => lastResort(text))
  } catch {
    return Promise.resolve(lastResort(text))
  }
}

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
