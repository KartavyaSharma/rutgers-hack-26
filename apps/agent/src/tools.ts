// What the agent's tools actually do, plus the small amount of state they share: the one pending
// draft, the drafts already sent, and a generation counter so a newer classification replaces an
// older one. No LiveKit types here, so this is unit-testable with a mocked fetch and classifier.
//
// Patient-facing text never names a team. Transcripts are never logged.
import {
  classifyRequest as coreClassifyRequest,
  detectRedFlag,
  draftReadBack,
  type LanguagePreference,
  needsNurseNow,
  patientMessage,
  RED_FLAG_LABELS,
  type RouteResult,
} from '@bell/core'
import { type ApiConfig, confirmDraft, createDraft, discardDraft, postRoutedRequest } from './api'

export interface ClassifyInput {
  /** The patient's own words. */
  text: string
  /** The room's language setting. */
  language: LanguagePreference
  /** One English line for staff, written by the conversation LLM. */
  staffSummary: string
  /** Very short read-back in the patient's language, written by the conversation LLM. */
  readBack: string
}

export type Classifier = (input: ClassifyInput) => Promise<RouteResult>

/**
 * The one classification seam (Jev through @bell/core today). Never rejects: red flags, clinical,
 * low confidence and failures all come back as nurse decisions.
 */
export const classifyRequest: Classifier = (input) => coreClassifyRequest(input)

export interface ToolLogger {
  info(fields: Record<string, unknown>, message: string): void
  warn(fields: Record<string, unknown>, message: string): void
  error(fields: Record<string, unknown>, message: string): void
}

export interface BellToolsOptions {
  roomId: string
  roomLanguage: LanguagePreference
  api: ApiConfig
  classify?: Classifier
  logger?: ToolLogger
}

export type ClassifyOutcome =
  | { outcome: 'draft'; draftId: string; readBack: string; say: string }
  | { outcome: 'sent_to_nurse_now'; say: string }
  /** The tablet's Send tap arrived before our create call returned. */
  | { outcome: 'sent'; say: string }
  /** A newer classify_and_draft (or a cancel) replaced this one; nothing to say. */
  | { outcome: 'superseded' }
  | { outcome: 'failed'; say: string }

export type ConfirmOutcome =
  | { outcome: 'sent'; say: string }
  | { outcome: 'no_pending_draft' }
  | { outcome: 'failed'; say: string }

export type CancelOutcome = { outcome: 'cancelled' } | { outcome: 'no_pending_draft' }

export type NurseOutcome =
  | { outcome: 'sent_to_nurse_now'; say: string }
  | { outcome: 'failed'; say: string }

export type TabletConfirmOutcome = { matched: true; language: string } | { matched: false }

interface PendingDraft {
  id: string
  language: string
}

const NOOP_LOGGER: ToolLogger = { info() {}, warn() {}, error() {} }

export class BellTools {
  readonly #roomId: string
  readonly #roomLanguage: LanguagePreference
  readonly #api: ApiConfig
  readonly #classify: Classifier
  readonly #log: ToolLogger
  #pending: PendingDraft | null = null
  /** Drafts known to be sent (by voice or the tablet), so a late confirm is a no-op success. */
  readonly #sent = new Set<string>()
  /** The most recent draft that became pending, for a "yes" that comes after a tap on Send. */
  #lastDraftId: string | undefined
  #generation = 0
  #inFlight = 0
  #heardLanguage: string | undefined
  #lastPatientText: string | undefined

  constructor(options: BellToolsOptions) {
    this.#roomId = options.roomId
    this.#roomLanguage = options.roomLanguage
    this.#api = options.api
    this.#classify = options.classify ?? classifyRequest
    this.#log = options.logger ?? NOOP_LOGGER
  }

  get pendingDraftId(): string | undefined {
    return this.#pending?.id
  }

  /**
   * Record what the patient last said (for call_my_nurse) and the language the STT heard (for
   * messages that have no routing decision). Kept in memory only, never logged.
   */
  heard({ text, language }: { text?: string; language?: string | null }): void {
    if (text) this.#lastPatientText = text
    if (language) this.#heardLanguage = language
  }

  /** Room setting first, then what the STT heard, then English. */
  get messageLanguage(): string {
    return this.#roomLanguage !== 'auto' ? this.#roomLanguage : (this.#heardLanguage ?? 'en')
  }

  /**
   * Deterministic safety check run on every transcript before the LLM sees it. On a red flag the
   * nurse gets an urgent request right away; returns what to say. Undefined: no red flag.
   */
  async redFlagCheck(text: string): Promise<NurseOutcome | undefined> {
    const match = detectRedFlag(text)
    if (!match) return undefined
    const language = this.#roomLanguage !== 'auto' ? this.#roomLanguage : match.language
    const decision: RouteResult = {
      team: 'nurse',
      category: match.category,
      urgency: 'urgent',
      clinical: true,
      confidence: 1,
      staffSummary: oneLine(
        `RED FLAG (${RED_FLAG_LABELS[match.category]}): Patient said "${oneLine(text, 120)}"`,
        160,
      ),
      patientReply: patientMessage('nurse_notified', language),
      language,
      reason: 'red_flag',
    }
    return this.#sendNow(text, decision)
  }

  /**
   * classify_and_draft. Something the nurse must see now is sent immediately; anything else
   * becomes a pending draft that waits for a yes or a tap on Send. A newer call replaces an older
   * pending draft, and an older call still running is dropped (unless it went to the nurse).
   */
  async classifyAndDraft(input: {
    request: string
    readBack: string
    staffSummary: string
  }): Promise<ClassifyOutcome> {
    const generation = ++this.#generation
    this.#inFlight++
    try {
      const decision = await this.#classify({
        text: input.request,
        language: this.#roomLanguage,
        staffSummary: input.staffSummary,
        readBack: input.readBack,
      })
      // Never dropped, even if superseded: anything for the nurse-now path goes out.
      if (needsNurseNow(decision)) return await this.#sendNow(input.request, decision)
      if (generation !== this.#generation) return { outcome: 'superseded' }

      const created = await createDraft(
        { roomId: this.#roomId, source: 'voice', text: input.request, decision },
        this.#api,
      )
      if (!created.ok) {
        this.#log.error(
          { ...routeFields(decision), error: created.error },
          'could not create draft',
        )
        return failed(decision.language)
      }
      const { draft } = created
      if (generation !== this.#generation) {
        this.#discardQuietly(draft.id, 'superseded')
        return { outcome: 'superseded' }
      }
      this.#log.info({ ...routeFields(decision), draftId: draft.id }, 'draft created')
      if (this.#sent.has(draft.id)) {
        return { outcome: 'sent', say: patientMessage('sent', decision.language) }
      }

      const previous = this.#pending
      this.#pending = { id: draft.id, language: decision.language }
      this.#lastDraftId = draft.id
      if (previous && previous.id !== draft.id) this.#discardQuietly(previous.id, 'replaced')
      return {
        outcome: 'draft',
        draftId: draft.id,
        readBack: decision.patientReply,
        say: draftReadBack(decision),
      }
    } catch (error) {
      // The classifier and the API client never reject; this keeps that promise for callers.
      this.#log.error({ error: describeError(error) }, 'classify_and_draft failed')
      return failed(this.messageLanguage)
    } finally {
      this.#inFlight--
    }
  }

  /** confirm_draft: confirms the pending draft. `draftId` is advisory. */
  async confirmDraft(draftId?: string): Promise<ConfirmOutcome> {
    const pending = this.#pending
    if (!pending) {
      // Already sent (e.g. the patient tapped Send and then said yes): a no-op success.
      const latest = draftId ?? this.#lastDraftId
      if (latest && this.#sent.has(latest)) {
        return { outcome: 'sent', say: patientMessage('sent', this.messageLanguage) }
      }
      return { outcome: 'no_pending_draft' }
    }
    if (draftId && draftId !== pending.id) {
      this.#log.warn(
        { draftId, pendingDraftId: pending.id },
        'confirm_draft id is not the pending one',
      )
    }

    // Cleared before the call so a tablet tap arriving meanwhile is a no-op.
    this.#pending = null
    const result = await confirmDraft(pending.id, this.#api)
    if (!result.ok) {
      this.#log.error({ draftId: pending.id, error: result.error }, 'could not confirm draft')
      // Still pending on the server unless it was discarded (409): keep waiting for a retry or a tap.
      if (result.status !== 409 && this.#pending === null) this.#pending = pending
      return failed(pending.language)
    }
    this.#sent.add(pending.id)
    this.#log.info({ draftId: pending.id, requestId: result.requestId }, 'draft confirmed by voice')
    return { outcome: 'sent', say: patientMessage('sent', pending.language) }
  }

  /** cancel_draft: discards the pending draft and drops any classification still running. */
  async cancelDraft(draftId?: string): Promise<CancelOutcome> {
    const pending = this.#pending
    const hadWork = pending !== null || this.#inFlight > 0
    this.#generation++
    this.#pending = null
    if (!hadWork) return { outcome: 'no_pending_draft' }
    if (pending) {
      if (draftId && draftId !== pending.id) {
        this.#log.warn(
          { draftId, pendingDraftId: pending.id },
          'cancel_draft id is not the pending one',
        )
      }
      const result = await discardDraft(pending.id, this.#api)
      if (result.ok) {
        this.#log.info({ draftId: pending.id }, 'draft cancelled')
      } else {
        // Nothing is sent either way: a pending draft never sends on its own.
        this.#log.warn({ draftId: pending.id, error: result.error }, 'could not discard draft')
      }
    }
    return { outcome: 'cancelled' }
  }

  /** call_my_nurse: an immediate nurse request, no draft. */
  async callMyNurse(input: {
    reason: string
    clinical: boolean
    /** The patient's own words; defaults to what they last said. */
    text?: string
  }): Promise<NurseOutcome> {
    const language = this.messageLanguage
    const reason = oneLine(input.reason, 140) || 'Patient asked for the nurse'
    const decision: RouteResult = {
      team: 'nurse',
      category: 'nurse_call',
      urgency: 'soon',
      clinical: input.clinical,
      confidence: 1,
      staffSummary: oneLine(`Patient asked for the nurse: ${reason}`, 160),
      patientReply: patientMessage('nurse_notified', language),
      language,
      reason: input.clinical ? 'clinical' : 'model',
    }
    return this.#sendNow(input.text?.trim() || this.#lastPatientText || reason, decision)
  }

  /**
   * The tablet confirmed a draft (patient tapped Send). Matched means it was the pending one and
   * the agent should tell the patient; otherwise it is remembered so a later confirm is a no-op.
   */
  tabletConfirmed(draftId: string): TabletConfirmOutcome {
    this.#sent.add(draftId)
    const pending = this.#pending
    if (pending?.id !== draftId) return { matched: false }
    this.#pending = null
    this.#log.info({ draftId }, 'draft confirmed on the tablet')
    return { matched: true, language: pending.language }
  }

  async #sendNow(text: string, decision: RouteResult): Promise<NurseOutcome> {
    const saved = await postRoutedRequest(
      { roomId: this.#roomId, source: 'voice', text, decision },
      this.#api,
    )
    if (!saved.ok) {
      this.#log.error(
        { ...routeFields(decision), error: saved.error },
        'could not save nurse request',
      )
      return failed(decision.language)
    }
    this.#log.info({ ...routeFields(decision), requestId: saved.requestId }, 'nurse request saved')
    return {
      outcome: 'sent_to_nurse_now',
      say: patientMessage('nurse_notified', decision.language),
    }
  }

  #discardQuietly(draftId: string, why: string): void {
    void discardDraft(draftId, this.#api).then((result) => {
      if (!result.ok)
        this.#log.warn({ draftId, why, error: result.error }, 'could not discard draft')
    })
  }
}

function failed(language: string): { outcome: 'failed'; say: string } {
  return { outcome: 'failed', say: patientMessage('save_failed', language) }
}

/** Routing metadata that is safe to log (no patient text). */
function routeFields(decision: RouteResult): Record<string, unknown> {
  return {
    team: decision.team,
    category: decision.category,
    urgency: decision.urgency,
    reason: decision.reason,
    language: decision.language,
  }
}

function oneLine(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
