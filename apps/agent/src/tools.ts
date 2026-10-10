// What the agent's tools actually do. No LiveKit types here, so this is unit-testable with a mocked
// fetch, a mocked classifier and fake timers.
//
// There is no confirm step: a request is classified and sent right away. Each tool runs in the
// background and its result is spoken through the injected `announce` callback. Results that land
// close together (one utterance, two needs) are confirmed once, with a fixed phrase and no
// read-back: "Sent." / "Both sent." / "All sent." (or "Your nurse is on the way."). Patient-facing
// text never names a team. Transcripts are never logged.
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
  /** Said right after `say` (a separate fixed phrase, so both play from the phrase cache). */
  followUp?: string
  note: string
}

/** A request the agent cancelled itself counts as "just cancelled" for this long. */
const AGENT_CANCEL_WINDOW_MS = 15_000

/** How long to wait for more results before announcing them together. */
export const ANNOUNCE_DEBOUNCE_MS = 300
/** A turn's confirmation waits for all its saves, but never longer than this after the first lands. */
export const TURN_ANNOUNCE_CAP_MS = 3000

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
  /** Order sent in this session, to tell "the last one" from requests before a cancel. */
  seq: number
}

/** One result waiting to be announced. */
export interface AnnouncedResult {
  kind: 'sent' | 'nurse' | 'failed'
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
  /** Requests the agent cancelled, with when, so the tablet's echo of them stays quiet. */
  readonly #cancelledByAgent = new Map<string, number>()
  /** The "want to change anything?" hint is said once per session, after the first "sent". */
  #changeHintGiven = false
  #seq = 0
  /** `seq` at the agent's last cancel: "cancel the last one" never reaches back past it. */
  #seqAtLastCancel = 0
  /** Sends still running, so cancel_request("last") can wait for the one just asked for. */
  readonly #running = new Set<Promise<unknown>>()
  #batch: AnnouncedResult[] = []
  /** Saves started by one LLM reply (keyed by its speech handle id), announced together once all settle. */
  readonly #turns = new Map<
    string,
    { started: number; results: AnnouncedResult[]; cap?: ReturnType<typeof setTimeout> }
  >()
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
  sendRequest(
    input: {
      request: string
      readBack: string
      staffSummary: string
    },
    turnId?: string,
  ): Promise<SendOutcome> {
    this.#turnStarted(turnId)
    return this.#track(this.#sendRequest(input, turnId))
  }

  async #sendRequest(
    input: {
      request: string
      readBack: string
      staffSummary: string
    },
    turnId?: string,
  ): Promise<SendOutcome> {
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
      this.#queue({ kind: 'failed', label, language: this.messageLanguage }, turnId)
      return { outcome: 'failed' }
    }

    const nurse = needsNurseNow(decision)
    const saved = await this.#post(input.request, decision)
    if (!saved.ok) {
      this.#queue({ kind: 'failed', label, language: decision.language }, turnId)
      return { outcome: 'failed' }
    }
    if (saved.requestId) {
      this.#sent.push({ id: saved.requestId, label, language: decision.language, seq: ++this.#seq })
    }
    this.#queue(
      {
        kind: nurse ? 'nurse' : 'sent',
        label,
        language: decision.language,
        requestId: saved.requestId,
      },
      turnId,
    )
    return { outcome: 'sent', requestId: saved.requestId, nurse }
  }

  /**
   * cancel_request: cancels the most recent request this session sent ("last", waiting for any
   * send already running) or the given id. Announces "cancelled". Never rejects.
   */
  async cancelRequest(which?: string, options: { change?: boolean } = {}): Promise<CancelOutcome> {
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
          seq: 0,
        })
      : this.#latestSinceLastCancel()
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
    this.#cancelledByAgent.set(target.id, Date.now())
    this.#seqAtLastCancel = this.#seq
    this.#log.info({ requestId: target.id, change: options.change === true }, 'request cancelled')
    if (options.change) {
      // A change: the LLM already said "Sure, what instead?" (or "Got it." with the new request),
      // so "cancelled" would only get in the way.
      this.#announce({
        note: `${NOTE_PREFIX} Cancelled "${target.label}" (request ${target.id}) so the patient can change it.`,
      })
    } else {
      this.#announce({
        say: patientMessage('cancelled', target.language),
        note: `${NOTE_PREFIX} Cancelled "${target.label}" (request ${target.id}). The patient was told.`,
      })
    }
    return { outcome: 'cancelled', requestId: target.id }
  }

  /** call_my_nurse: an immediate nurse request. Announced when it lands. Never rejects. */
  callMyNurse(
    input: {
      reason: string
      clinical: boolean
      /** The patient's own words; defaults to what they last said. */
      text?: string
    },
    turnId?: string,
  ): Promise<SendOutcome> {
    this.#turnStarted(turnId)
    return this.#track(this.#callMyNurse(input, turnId))
  }

  async #callMyNurse(input: { reason: string; clinical: boolean; text?: string }, turnId?: string) {
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
      this.#queue({ kind: 'failed', label, language }, turnId)
      return { outcome: 'failed' } as const
    }
    if (saved.requestId) this.#sent.push({ id: saved.requestId, label, language, seq: ++this.#seq })
    this.#queue({ kind: 'nurse', label, language, requestId: saved.requestId }, turnId)
    return { outcome: 'sent', requestId: saved.requestId, nurse: true } as const
  }

  /**
   * The tablet's Delete button cancelled these requests. They are no longer cancellable by voice;
   * the patient hears "cancelled" unless the agent itself cancelled them a moment ago. Returns
   * whether anything was said.
   */
  tabletCancelled(requestIds: readonly string[]): boolean {
    const now = Date.now()
    const labels = requestIds.map((id) => {
      const index = this.#sent.findIndex((r) => r.id === id)
      const label = index >= 0 ? this.#sent[index]?.label : undefined
      if (index >= 0) this.#sent.splice(index, 1)
      return label ? `"${label}" (request ${id})` : `request ${id}`
    })
    const echo = requestIds.every(
      (id) => now - (this.#cancelledByAgent.get(id) ?? 0) < AGENT_CANCEL_WINDOW_MS,
    )
    const note = `${NOTE_PREFIX} The patient cancelled ${labels.join(', ')} on the tablet.`
    this.#log.info({ requestIds, echo }, 'requests cancelled on the tablet')
    if (echo || requestIds.length === 0) {
      this.#announce({ note })
      return false
    }
    this.#announce({
      say: patientMessage('cancelled', this.messageLanguage),
      note: `${note} They heard "cancelled".`,
    })
    return true
  }

  /**
   * The most recent request sent since the agent last cancelled one. A second "cancel that" (the
   * model sometimes cancels again when the patient then says what instead) must not reach back
   * and cancel an older, unrelated request.
   */
  #latestSinceLastCancel(): SentRequest | undefined {
    const latest = this.#sent.at(-1)
    return latest && latest.seq > this.#seqAtLastCancel ? latest : undefined
  }

  /** Drops anything still queued and stops the timer (session ending). */
  close(): void {
    if (this.#batchTimer !== undefined) clearTimeout(this.#batchTimer)
    this.#batchTimer = undefined
    this.#batch = []
    for (const turn of this.#turns.values()) if (turn.cap !== undefined) clearTimeout(turn.cap)
    this.#turns.clear()
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

  /** Registers one more save for this reply, so its confirmation waits for it. */
  #turnStarted(turnId: string | undefined): void {
    if (!turnId) return
    const turn = this.#turns.get(turnId)
    if (turn) turn.started += 1
    else this.#turns.set(turnId, { started: 1, results: [] })
  }

  /**
   * Queues a result. Results from the same LLM reply (turnId) are announced once, after every save
   * that reply started has settled (capped at TURN_ANNOUNCE_CAP_MS), so one sentence with two
   * needs is one "Both sent." however far apart the saves land. Without a turn id (or for a
   * straggler after its turn was already announced), results within the debounce window are
   * announced together.
   */
  #queue(result: AnnouncedResult, turnId?: string): void {
    const turn = turnId ? this.#turns.get(turnId) : undefined
    if (turnId && turn) {
      turn.results.push(result)
      if (turn.results.length >= turn.started) {
        if (turn.cap !== undefined) clearTimeout(turn.cap)
        this.#turns.delete(turnId)
        this.#flush(turn.results)
      } else if (turn.cap === undefined) {
        turn.cap = setTimeout(() => {
          this.#turns.delete(turnId)
          this.#flush(turn.results)
        }, TURN_ANNOUNCE_CAP_MS)
      }
      return
    }
    this.#batch.push(result)
    if (this.#batchTimer !== undefined) clearTimeout(this.#batchTimer)
    this.#batchTimer = setTimeout(() => {
      this.#batchTimer = undefined
      const batch = this.#batch
      this.#batch = []
      this.#flush(batch)
    }, this.#debounceMs)
  }

  /** Speaks one line for a batch of results, plus Kurt's change hint once per session. */
  #flush(batch: AnnouncedResult[]): void {
    const announcement = composeAnnouncement(batch)
    if (!announcement) return
    // Kurt's line, once per session, after the first plain "sent" confirmation.
    const plainSend = batch.some((r) => r.kind === 'sent') && batch.every((r) => r.kind === 'sent')
    if (plainSend && !this.#changeHintGiven) {
      this.#changeHintGiven = true
      announcement.followUp = patientMessage(
        'change_hint',
        batch.at(-1)?.language ?? this.messageLanguage,
      )
    }
    this.#announce(announcement)
  }
}

/**
 * One spoken line (and one note) for results that landed together. No read-backs: the patient
 * already heard their own words. If the nurse was alerted, that is all they need to hear.
 */
export function composeAnnouncement(results: readonly AnnouncedResult[]): Announcement | undefined {
  const last = results.at(-1)
  if (!last) return undefined
  const language = last.language
  const sent = results.filter((r) => r.kind === 'sent')
  const nurse = results.filter((r) => r.kind === 'nurse')
  const failed = results.filter((r) => r.kind === 'failed')

  const spoken: string[] = []
  const notes: string[] = []
  if (nurse.length > 0) {
    spoken.push(patientMessage('nurse_notified', language))
  } else if (sent.length > 0) {
    const key = sent.length === 1 ? 'sent' : sent.length === 2 ? 'sent_two' : 'sent_many'
    spoken.push(patientMessage(key, language))
  }
  if (nurse.length > 0) notes.push(`Sent to the nurse right away: ${describe(nurse)}.`)
  if (sent.length > 0) notes.push(`Sent: ${describe(sent)}.`)
  if (failed.length > 0) {
    spoken.push(patientMessage('save_failed', language))
    notes.push(
      `Could not send: ${describe(failed)}; the patient was told to press the My nurse button.`,
    )
  }
  return {
    say: joinSentences(spoken, language),
    note: `${NOTE_PREFIX} ${notes.join(' ')} The patient heard the confirmation; do not repeat it.`,
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

const NO_SPACE = new Set(['ja', 'zh'])

const baseLanguage = (language: string): string => language.split(/[-_]/)[0]?.toLowerCase() || 'en'

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
