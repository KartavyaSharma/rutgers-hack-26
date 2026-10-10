// Routing with Jev (TypeSafe AI) instead of the Qwen JSON router. Same safety order and the
// same never-fails error handling as routeTextEffect; IMMEDIATE_BY_REASON (via needsNurseNow)
// still decides what the patient is told.
import { Duration, Effect } from 'effect'
import type { RouterError } from './errors'
import { RouterTimeout } from './errors'
import {
  isSafeReadBack,
  nurseFallback,
  quoteForStaff,
  redFlagResult,
  withPatientReply,
} from './fallback'
import { Jev, type JevAnswers, type JevLayer } from './jev'
import { guessLanguage, oneLine } from './language'
import { detectRedFlag } from './redFlags'
import {
  CONFIDENCE_THRESHOLD,
  normalizeCategory,
  ROUTER_TIMEOUT_MS,
  recoverToNurse,
} from './router'
import {
  isLanguageCode,
  type LanguageCode,
  type LanguagePreference,
  NURSE_BUTTON,
  needsNurseNow,
  type RouteReason,
  type RouteResult,
} from './taxonomy'

/** Jev's clinical score (the "noul", 0..1) at or above this makes a request clinical. */
export const CLINICAL_THRESHOLD = 0.5

/**
 * When Jev already picked the nurse, a weaker clinical signal is enough: at or above this
 * score a nurse request is treated as clinical (the patient is told the nurse was alerted).
 */
export const NURSE_CLINICAL_THRESHOLD = 0.25

export interface ClassifyInput {
  /** What the patient typed or said. */
  readonly text: string
  /** The room's language setting. "auto" (the default) detects it from the text. */
  readonly language?: LanguagePreference | undefined
  /** One-line English summary for staff (e.g. written by the voice agent's LLM). */
  readonly staffSummary?: string | undefined
  /** Read-back for the patient, in their language (e.g. "An extra pillow."). Never names a team. */
  readonly readBack?: string | undefined
  /** Category label. Defaults to Jev's request group (a REQUEST_GROUPS id, see groupOfCategory). */
  readonly category?: string | undefined
}

export interface ClassifyOptions {
  /** Defaults to ROUTER_TIMEOUT_MS. */
  readonly timeoutMs?: number | undefined
}

/** Clinical by score, or a nurse request with a weaker clinical signal. */
export const isClinicalAnswer = (answers: JevAnswers): boolean =>
  answers.clinical >= CLINICAL_THRESHOLD ||
  (answers.team === 'nurse' && answers.clinical >= NURSE_CLINICAL_THRESHOLD)

const cleanText = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined
  const line = oneLine(value, max)
  return line.length > 0 ? line : undefined
}

/** Jev's answers -> a RouteResult, with the clinical and confidence rules applied. */
const fromJev = (
  text: string,
  language: string,
  category: string | undefined,
  answers: JevAnswers,
): RouteResult => {
  const base = {
    category: category ?? answers.group,
    confidence: answers.teamConfidence,
    staffSummary: quoteForStaff(text, language),
    language,
  }
  if (isClinicalAnswer(answers)) {
    return withPatientReply(
      { ...base, team: 'nurse', urgency: 'urgent', clinical: true, reason: 'clinical' },
      text,
    )
  }
  if (answers.teamConfidence < CONFIDENCE_THRESHOLD) {
    return withPatientReply(
      {
        ...base,
        team: 'nurse',
        urgency: answers.urgency,
        clinical: false,
        reason: 'low_confidence',
      },
      text,
    )
  }
  return withPatientReply(
    { ...base, team: answers.team, urgency: answers.urgency, clinical: false, reason: 'model' },
    text,
  )
}

/**
 * Whether a result carries Jev's answers. The others (red flags, failures, empty input) get the
 * nurse button's category, "nurse_call". A full record so a new reason must be placed here.
 */
const ANSWERED_BY_JEV: Readonly<Record<RouteReason, boolean>> = {
  model: true,
  clinical: true,
  low_confidence: true,
  red_flag: false,
  timeout: false,
  rate_limited: false,
  invalid_output: false,
  error: false,
  not_configured: false,
  empty_input: false,
}

const withNurseCallCategory = (result: RouteResult): RouteResult =>
  ANSWERED_BY_JEV[result.reason] ? result : { ...result, category: NURSE_BUTTON.category }

/**
 * Use the caller's staff summary and read-back (the request card label) where they apply:
 * - staffSummary replaces the default, except on red flags (staff see the patient's words).
 * - readBack replaces the quoted words unless the nurse was alerted, and only if it names no
 *   team and doesn't claim anything was sent. Nurse-now results keep "Your nurse is on the way."
 */
const applyCallerText = (result: RouteResult, input: ClassifyInput): RouteResult => {
  try {
    const staffSummary = cleanText(input.staffSummary, 160)
    const readBack = cleanText(input.readBack, 240)
    let out = result
    if (staffSummary !== undefined && out.reason !== 'red_flag') out = { ...out, staffSummary }
    if (
      readBack !== undefined &&
      !needsNurseNow(out) &&
      out.reason !== 'empty_input' &&
      isSafeReadBack(readBack)
    ) {
      out = { ...out, patientReply: readBack }
    }
    return out
  } catch {
    return result
  }
}

/**
 * Classify one patient request with Jev. Never fails.
 * Order: empty input, red-flag phrases (no Jev call), Jev with a timeout, then the clinical
 * and confidence rules; every failure becomes a nurse decision with its reason.
 */
export const classifyRequestEffect = (
  input: ClassifyInput,
  layer: JevLayer,
  options: ClassifyOptions = {},
): Effect.Effect<RouteResult> => {
  const text = typeof input?.text === 'string' ? input.text : ''
  const fixedLanguage: LanguageCode | undefined = isLanguageCode(input?.language)
    ? input.language
    : undefined
  const timeoutMs = options.timeoutMs ?? ROUTER_TIMEOUT_MS

  const routed = Effect.suspend((): Effect.Effect<RouteResult, RouterError> => {
    if (text.trim().length === 0) {
      return Effect.succeed(nurseFallback(text, 'empty_input', fixedLanguage))
    }

    const redFlag = detectRedFlag(text)
    if (redFlag !== null) return Effect.succeed(redFlagResult(text, redFlag, fixedLanguage))

    const language = fixedLanguage ?? guessLanguage(text) ?? 'en'
    const category = cleanText(input.category, 64)
    return Jev.use((jev) => jev.classify(text)).pipe(
      Effect.map((answers) =>
        fromJev(
          text,
          language,
          category === undefined ? undefined : normalizeCategory(category),
          answers,
        ),
      ),
      Effect.provide(layer),
      Effect.timeoutOrElse({
        duration: Duration.millis(timeoutMs),
        orElse: () => Effect.fail(new RouterTimeout({ timeoutMs })),
      }),
    )
  })

  return routed.pipe(
    recoverToNurse(text, fixedLanguage),
    Effect.map(withNurseCallCategory),
    Effect.map((result) =>
      input === null || input === undefined ? result : applyCallerText(result, input),
    ),
  )
}
