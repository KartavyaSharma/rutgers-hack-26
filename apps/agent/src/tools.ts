// What the agent's tools actually do. No LiveKit types here, so this is unit-testable with a mocked
// fetch, a mocked classifier and fake timers.
//
// There is no confirm step: a request is classified and sent right away. Each tool runs in the
// background and its result is spoken through the injected `announce` callback. Results that land
// close together (one utterance, two needs) are announced once: "A pillow and some water. Sent.
// Someone will be with you soon." Patient-facing text never names a team. Transcripts are never
// logged.
import {
  classifyRequest as coreClassifyRequest,
  detectRedFlag,
  isLanguagePreference,
  type LanguagePreference,
  needsNurseNow,
  patientMessage,
  RED_FLAG_LABELS,
  type RouteResult,
} from '@bell/core'
import { type ApiConfig, addRequestNote, cancelRequest, postRoutedRequest } from './api'
import { NOTE_PREFIX } from './prompt'

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

/** Something to tell the patient (optional) and a note for the LLM's chat context. */
export interface Announcement {
  say?: string
  note: string
}

/** How long to wait for more results before announcing them together. */
export const ANNOUNCE_DEBOUNCE_MS = 300

export interface BellToolsOptions {
  roomId: string
  roomLanguage: LanguagePreference
  api: ApiConfig
  classify?: Classifier
  logger?: ToolLogger
  /** Speaks (and notes) background results. */
  announce?: (announcement: Announcement) => void
  announceDebounceMs?: number
}

export type SendOutcome =
  | { outcome: 'sent'; requestId: string | undefined; nurse: boolean }
  | { outcome: 'failed' }

export type CancelOutcome =
  | { outcome: 'cancelled'; requestId: string }
  | { outcome: 'nothing_to_cancel' }
  | { outcome: 'failed'; requestId: string }

export type NurseOutcome =
  | { outcome: 'sent_to_nurse_now'; say: string }
  | { outcome: 'failed'; say: string }

/** A request this session sent, newest last; what cancel_request("last") cancels. */
interface SentRequest {
  id: string
  /** Short description for the LLM's notes. */
  label: string
  language: string
}

/** One result waiting to be announced. */
export interface AnnouncedResult {
  kind: 'sent' | 'nurse' | 'failed'
  /** Spoken before "Sent." for normal requests. */
  readBack?: string
  /** For the LLM's note. */
  label: string
  language: string
  requestId?: string
}

const NOOP_LOGGER: ToolLogger = { info() {}, warn() {}, error() {} }

export class BellTools {
  readonly #roomId: string
  readonly #roomLanguage: LanguagePreference
  readonly #api: ApiConfig
  readonly #classify: Classifier
  readonly #log: ToolLogger
  readonly #announce: (announcement: Announcement) => void
  readonly #debounceMs: number
  readonly #sent: SentRequest[] = []
  /** Sends still running, so cancel_request("last") can wait for the one just asked for. */
  readonly #running = new Set<Promise<unknown>>()
  #batch: AnnouncedResult[] = []
  #batchTimer: ReturnType<typeof setTimeout> | undefined
  #heardLanguage: string | undefined
  #lastPatientText: string | undefined

  constructor(options: BellToolsOptions) {
    this.#roomId = options.roomId
    this.#roomLanguage = options.roomLanguage
    this.#api = options.api
    this.#classify = options.classify ?? classifyRequest
    this.#log = options.logger ?? NOOP_LOGGER
    this.#announce = options.announce ?? (() => {})
    this.#debounceMs = options.announceDebounceMs ?? ANNOUNCE_DEBOUNCE_MS
  }

  /** Ids of requests this session sent that can still be cancelled, oldest first. */
  get sentRequestIds(): string[] {
    return this.#sent.map((r) => r.id)
  }

  /**
   * Record what the patient last said (for call_my_nurse) and the language the STT heard (for
   * messages that have no routing decision). Kept in memory only, never logged.
   */
  heard({ text, language }: { text?: string; language?: string | null }): void {
    if (text) this.#lastPatientText = text
    if (language) this.#heardLanguage = language
  }

  /** For the classifier: the room setting, else the language the STT heard, else auto-detect. */
  get classifyLanguage(): LanguagePreference {
    if (this.#roomLanguage !== 'auto') return this.#roomLanguage
    return isLanguagePreference(this.#heardLanguage) ? this.#heardLanguage : 'auto'
  }

  /** Language the STT heard last, if any. */
  get heardLanguage(): string | undefined {
    return this.#heardLanguage
  }

  /** Room setting first, then what the STT heard, then English. */
  get messageLanguage(): string {
    return this.#roomLanguage !== 'auto' ? this.#roomLanguage : (this.#heardLanguage ?? 'en')
  }

  /**
   * Deterministic safety check run on every transcript before the LLM sees it. On a red flag the
   * nurse gets an urgent request right away; returns what to say. Undefined: no red flag.
   * These requests are not voice-cancellable (the tablet can still cancel them).
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
    const saved = await this.#post(text, decision)
    return saved.ok
      ? { outcome: 'sent_to_nurse_now', say: patientMessage('nurse_notified', language) }
      : { outcome: 'failed', say: patientMessage('save_failed', language) }
  }

  /** send_request: classify, then send right away. Announced when it lands. Never rejects. */
  sendRequest(input: {
    request: string
    readBack: string
    staffSummary: string
  }): Promise<SendOutcome> {
    return this.#track(this.#sendRequest(input))
  }

  async #sendRequest(input: {
    request: string
    readBack: string
    staffSummary: string
  }): Promise<SendOutcome> {
    const label = oneLine(input.readBack, 80) || oneLine(input.staffSummary, 80)
    let decision: RouteResult
    try {
      decision = await this.#classify({
        text: input.request,
        language: this.classifyLanguage,
        staffSummary: input.staffSummary,
        readBack: input.readBack,
      })
    } catch (error) {
      // The classifier never rejects; this keeps the promise for callers anyway.
      this.#log.error({ error: describeError(error) }, 'classification failed')
      this.#queue({ kind: 'failed', label, language: this.messageLanguage })
      return { outcome: 'failed' }
    }

    const nurse = needsNurseNow(decision)
    const saved = await this.#post(input.request, decision)
    if (!saved.ok) {
      this.#queue({ kind: 'failed', label, language: decision.language })
      return { outcome: 'failed' }
    }
    if (saved.requestId) {
      this.#sent.push({ id: saved.requestId, label, language: decision.language })
    }
    this.#queue({
      kind: nurse ? 'nurse' : 'sent',
      // core's patientReply is the read-back, checked so it never names a team
      readBack: nurse ? undefined : decision.patientReply.trim(),
      label,
      language: decision.language,
      requestId: saved.requestId,
    })
    return { outcome: 'sent', requestId: saved.requestId, nurse }
  }

  /**
   * cancel_request: cancels the most recent request this session sent ("last", waiting for any
   * send already running) or the given id. Announces "cancelled". Never rejects.
   */
  async cancelRequest(which?: string): Promise<CancelOutcome> {
    const byId = which && which !== 'last' ? which : undefined
    if (!byId && this.#running.size > 0) {
      // "No, cancel that" right after asking: the request may still be on its way.
      await Promise.allSettled([...this.#running])
    }
    const target = byId
      ? (this.#sent.find((r) => r.id === byId) ?? {
          id: byId,
          label: 'that request',
          language: this.messageLanguage,
        })
      : this.#sent.at(-1)
    if (!target) {
      this.#announce({ note: `${NOTE_PREFIX} There was no request to cancel.` })
      return { outcome: 'nothing_to_cancel' }
    }

    const result = await cancelRequest(target.id, this.#api)
    if (!result.ok) {
      this.#log.error({ requestId: target.id, error: result.error }, 'could not cancel request')
      // Nothing alarming to say: the request simply stays active, and the tablet can cancel it.
      this.#announce({
        note: `${NOTE_PREFIX} Cancelling "${target.label}" failed, so it is still active. The patient can cancel it from My requests on the tablet.`,
      })
      return { outcome: 'failed', requestId: target.id }
    }
    const index = this.#sent.findIndex((r) => r.id === target.id)
    if (index >= 0) this.#sent.splice(index, 1)
    this.#log.info({ requestId: target.id }, 'request cancelled')
    this.#announce({
      say: patientMessage('cancelled', target.language),
      note: `${NOTE_PREFIX} Cancelled "${target.label}" (request ${target.id}). The patient was told.`,
    })
    return { outcome: 'cancelled', requestId: target.id }
  }

  /** call_my_nurse: an immediate nurse request. Announced when it lands. Never rejects. */
  callMyNurse(input: {
    reason: string
    clinical: boolean
    /** The patient's own words; defaults to what they last said. */
    text?: string
  }): Promise<SendOutcome> {
    return this.#track(this.#callMyNurse(input))
  }

  async #callMyNurse(input: { reason: string; clinical: boolean; text?: string }) {
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
    const label = `the nurse (${oneLine(reason, 60)})`
    const saved = await this.#post(input.text?.trim() || this.#lastPatientText || reason, decision)
    if (!saved.ok) {
      this.#queue({ kind: 'failed', label, language })
      return { outcome: 'failed' } as const
    }
    if (saved.requestId) this.#sent.push({ id: saved.requestId, label, language })
    this.#queue({ kind: 'nurse', label, language, requestId: saved.requestId })
    return { outcome: 'sent', requestId: saved.requestId, nurse: true } as const
  }

  /** Drops anything still queued and stops the timer (session ending). */
  close(): void {
    if (this.#batchTimer !== undefined) clearTimeout(this.#batchTimer)
    this.#batchTimer = undefined
    this.#batch = []
  }

  async #post(text: string, decision: RouteResult) {
    const saved = await postRoutedRequest(
      { roomId: this.#roomId, source: 'voice', text, decision },
      this.#api,
    )
    if (saved.ok) {
      this.#log.info({ ...routeFields(decision), requestId: saved.requestId }, 'request sent')
    } else {
      this.#log.error({ ...routeFields(decision), error: saved.error }, 'could not send request')
    }
    return saved
  }

  #track<T>(promise: Promise<T>): Promise<T> {
    this.#running.add(promise)
    void promise.finally(() => this.#running.delete(promise))
    return promise
  }

  /** Queues a result; results that land within the debounce window are announced together. */
  #queue(result: AnnouncedResult): void {
    this.#batch.push(result)
    if (this.#batchTimer !== undefined) clearTimeout(this.#batchTimer)
    this.#batchTimer = setTimeout(() => {
      this.#batchTimer = undefined
      const batch = this.#batch
      this.#batch = []
      const announcement = composeAnnouncement(batch)
      if (announcement) this.#announce(announcement)
    }, this.#debounceMs)
  }
}

/** One spoken line (and one note) for results that landed together. */
export function composeAnnouncement(results: readonly AnnouncedResult[]): Announcement | undefined {
  const last = results.at(-1)
  if (!last) return undefined
  const language = last.language
  const sent = results.filter((r) => r.kind === 'sent')
  const nurse = results.filter((r) => r.kind === 'nurse')
  const failed = results.filter((r) => r.kind === 'failed')

  const spoken: string[] = []
  const notes: string[] = []
  if (sent.length > 0) {
    const readBack = joinReadBacks(
      sent.map((r) => r.readBack ?? ''),
      language,
    )
    spoken.push(
      readBack
        ? joinSentences([readBack, patientMessage('sent', language)], language)
        : patientMessage('sent', language),
    )
    notes.push(`Sent: ${describe(sent)}.`)
  }
  if (nurse.length > 0) {
    spoken.push(patientMessage('nurse_notified', language))
    notes.push(`Sent to the nurse right away: ${describe(nurse)}.`)
  }
  if (failed.length > 0) {
    spoken.push(patientMessage('save_failed', language))
    notes.push(
      `Could not send: ${describe(failed)}; the patient was told to press the My nurse button.`,
    )
  }
  return {
    say: joinSentences(spoken, language),
    note: `${NOTE_PREFIX} ${notes.join(' ')} The patient heard this.`,
  }
}

function describe(results: readonly AnnouncedResult[]): string {
  return results
    .map((r) => (r.requestId ? `"${r.label}" (request ${r.requestId})` : `"${r.label}"`))
    .join(', ')
}

/**
 * Emergency mode: no classification and no new requests. Each thing the patient says is appended
 * to the emergency request's notes. The patient hears "noted" once, after the first successful note.
 */
export class EmergencyNotes {
  readonly #requestId: string
  readonly #api: ApiConfig
  readonly #log: ToolLogger
  #acknowledged = false

  constructor(options: { requestId: string; api: ApiConfig; logger?: ToolLogger }) {
    this.#requestId = options.requestId
    this.#api = options.api
    this.#log = options.logger ?? NOOP_LOGGER
  }

  /** Adds a note; returns what to say (only the first time), or undefined. Never rejects. */
  async add(text: string, language: string): Promise<string | undefined> {
    const result = await addRequestNote(this.#requestId, text, this.#api)
    if (!result.ok) {
      // Nothing scary for the patient: the emergency request itself already exists.
      this.#log.error(
        { requestId: this.#requestId, error: result.error },
        'could not add emergency note',
      )
      return undefined
    }
    this.#log.info({ requestId: this.#requestId }, 'emergency note added')
    if (this.#acknowledged) return undefined
    this.#acknowledged = true
    return patientMessage('emergency_noted', language)
  }
}

const NO_CASE_CHANGE = new Set(['de'])
const NO_SPACE = new Set(['ja', 'zh'])
const TERMINALS: Record<string, string> = { ja: '。', zh: '。', hi: '।' }

const baseLanguage = (language: string): string => language.split(/[-_]/)[0]?.toLowerCase() || 'en'

/**
 * Joins short read-backs into one sentence in the patient's language:
 * ["An extra pillow.", "Some water."] -> "An extra pillow and some water."
 */
export function joinReadBacks(items: readonly string[], language: string): string {
  const cleaned = items.map((item) => item.trim()).filter((item) => item.length > 0)
  if (cleaned.length <= 1) return cleaned[0] ?? ''
  const lang = baseLanguage(language)
  const parts = cleaned.map((item, index) => {
    const part = item.replace(/[\s.!?。！？।]+$/u, '')
    // "Some water" -> "some water" mid-sentence, but not "TV" and never German nouns.
    if (index > 0 && !NO_CASE_CHANGE.has(lang) && /^\p{Lu}\p{Ll}/u.test(part)) {
      return part.charAt(0).toLowerCase() + part.slice(1)
    }
    return part
  })
  let list: string
  try {
    list = new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(parts)
  } catch {
    list = parts.join(', ')
  }
  return `${list}${TERMINALS[lang] ?? '.'}`
}

/** Joins whole sentences, with no space for Japanese and Chinese. */
export function joinSentences(sentences: readonly string[], language: string): string {
  const parts = sentences.map((s) => s.trim()).filter((s) => s.length > 0)
  return parts.join(NO_SPACE.has(baseLanguage(language)) ? '' : ' ')
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
