// Job entry for the voice worker. The worker forks a process per job and imports this file by
// path (see main.ts), so it must have no side effects beyond defining the agent.
//
// There is no LLM in the session: Deepgram Flux closes each user turn, onUserTurnCompleted runs
// the small state machine below and speaks with session.say(), then throws StopResponse so the
// framework doesn't try to generate a reply of its own.
//
//   idle + turn      -> routeText()
//                         needsNurseNow -> POST /api/requests, say "nurse notified"      (idle)
//                         otherwise     -> POST /api/drafts, say the read-back           (awaiting)
//   awaiting + turn  -> "yes"   -> confirm the draft, say "sent"                          (idle)
//                       "no"    -> discard the draft, say "what do you need?"            (idle)
//                       other   -> discard the draft, handle the text as a new request
//   awaiting + RPC DRAFT_CONFIRMED_RPC for that draft (patient tapped Send) -> say "sent" (idle)
//
// A draft is never sent without a yes or a tap; silence keeps it waiting.
// Patient-facing speech never names a team. Transcripts are never logged.
import {
  classifyConfirmation,
  DRAFT_CONFIRMED_RPC,
  draftReadBack,
  isLanguagePreference,
  type LanguagePreference,
  needsNurseNow,
  patientMessage,
  type RequestDraft,
  routeText,
} from '@bell/core'
import {
  type ChatContext,
  type ChatMessage,
  defineAgent,
  type JobContext,
  log,
  voice,
} from '@livekit/agents'
import * as deepgram from '@livekit/agents-plugin-deepgram'
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs'
import type { RpcInvocationData } from '@livekit/rtc-node'
import { type ApiConfig, confirmDraft, createDraft, discardDraft, postRoutedRequest } from './api'
import { agentEnv, loadRootEnv } from './env'

// The job process inherits the parent's env; loading again only matters when this file is
// imported on its own (e.g. console mode). Values already set win.
loadRootEnv()

/** A spoken yes/no this soon after a tap on Send is the same answer, not a new request. */
const TAP_ECHO_WINDOW_MS = 10_000

type State = { kind: 'idle' } | { kind: 'awaiting'; draft: RequestDraft }

const IDLE: State = { kind: 'idle' }

export class BellAgent extends voice.Agent {
  readonly #roomId: string
  readonly #language: LanguagePreference
  readonly #api: ApiConfig
  #state: State = IDLE
  /** Drafts the tablet confirmed that we weren't awaiting (yet): guards the create/tap race. */
  readonly #tappedDraftIds = new Set<string>()
  #lastTapAt = Number.NEGATIVE_INFINITY

  constructor(job: JobInfo, api: ApiConfig) {
    // No LLM is attached, so these instructions are never sent anywhere.
    super({ instructions: 'Bedside call bell: route each spoken request to the right team.' })
    this.#roomId = job.roomId
    this.#language = job.language
    this.#api = api
  }

  override async onUserTurnCompleted(
    _chatCtx: ChatContext,
    newMessage: ChatMessage,
  ): Promise<void> {
    const text = newMessage.textContent?.trim() ?? ''
    const reply = text ? await this.#onTurn(text) : undefined
    // Not awaited: the reply plays out on its own; waiting here would hold up the next turn.
    if (reply) this.session.say(reply)
    throw new voice.StopResponse()
  }

  /**
   * RPC from the tablet after the patient tapped Send. The tablet already confirmed through the
   * API, so this only stops the wait and tells the patient. Returns a short ack.
   */
  async onDraftConfirmed(data: RpcInvocationData): Promise<string> {
    const draftId = parseDraftId(data.payload)
    if (!draftId) return 'invalid'
    const state = this.#state
    if (state.kind !== 'awaiting' || state.draft.id !== draftId) {
      // Either already handled (the patient also said yes) or a draft we are still creating.
      this.#tappedDraftIds.add(draftId)
      return 'ignored'
    }
    this.#state = IDLE
    this.#lastTapAt = Date.now()
    this.#logger().info({ draftId }, 'draft confirmed on the tablet')
    try {
      this.session.say(patientMessage('sent', state.draft.decision.language))
    } catch (error) {
      // the session is closing
      this.#logger().warn({ error: describeError(error) }, 'could not speak after tablet confirm')
    }
    return 'ok'
  }

  /** One user turn; returns what to say (nothing for an echo of a tap). Never rejects. */
  async #onTurn(text: string): Promise<string | undefined> {
    try {
      const state = this.#state
      if (state.kind === 'awaiting') return await this.#answerDraft(state.draft, text)
      if (
        Date.now() - this.#lastTapAt < TAP_ECHO_WINDOW_MS &&
        classifyConfirmation(text, this.#language) !== 'other'
      ) {
        return undefined
      }
      return await this.#newRequest(text)
    } catch (error) {
      // Everything below is written not to throw; this guard makes sure the patient hears something.
      this.#state = IDLE
      this.#logger().error({ error: describeError(error) }, 'voice turn failed')
      return patientMessage('save_failed', this.#language)
    }
  }

  async #answerDraft(draft: RequestDraft, text: string): Promise<string | undefined> {
    const language = draft.decision.language
    const answer = classifyConfirmation(text, language)
    // Leave the awaiting state before any await so a tap on Send arriving meanwhile is a no-op.
    this.#state = IDLE

    if (answer === 'yes') {
      const confirmed = await confirmDraft(draft.id, this.#api)
      if (!confirmed.ok) {
        this.#logger().error(
          { draftId: draft.id, error: confirmed.error },
          'could not confirm draft',
        )
        return patientMessage('save_failed', language)
      }
      this.#logger().info(
        { draftId: draft.id, requestId: confirmed.requestId },
        'draft confirmed by voice',
      )
      return patientMessage('sent', language)
    }

    const discarded = await discardDraft(draft.id, this.#api)
    if (!discarded.ok) {
      // Nothing was sent either way, so the patient hears the same thing; the tablet still
      // shows the pending draft, which never sends on its own.
      this.#logger().warn({ draftId: draft.id, error: discarded.error }, 'could not discard draft')
    }
    if (answer === 'no') return patientMessage('ask_again', language)
    // A correction or a different request (possibly a red flag): route it from scratch.
    return this.#newRequest(text)
  }

  async #newRequest(text: string): Promise<string> {
    const decision = await routeText(text, { language: this.#language })
    const { language } = decision
    const route = {
      team: decision.team,
      urgency: decision.urgency,
      reason: decision.reason,
      language,
    }

    if (needsNurseNow(decision)) {
      const saved = await postRoutedRequest(
        { roomId: this.#roomId, source: 'voice', text, decision },
        this.#api,
      )
      if (!saved.ok) {
        this.#logger().error({ ...route, error: saved.error }, 'could not save nurse-now request')
        return patientMessage('save_failed', language)
      }
      this.#logger().info({ ...route, requestId: saved.requestId }, 'nurse-now request saved')
      return patientMessage('nurse_notified', language)
    }

    const created = await createDraft(
      { roomId: this.#roomId, source: 'voice', text, decision },
      this.#api,
    )
    if (!created.ok) {
      this.#logger().error({ ...route, error: created.error }, 'could not create draft')
      return patientMessage('save_failed', language)
    }
    const { draft } = created
    this.#logger().info({ ...route, draftId: draft.id }, 'draft created')
    if (this.#tappedDraftIds.has(draft.id)) {
      // The patient tapped Send before our create call returned.
      this.#lastTapAt = Date.now()
      return patientMessage('sent', language)
    }
    this.#state = { kind: 'awaiting', draft }
    return draftReadBack(decision)
  }

  #logger() {
    return log().child({ roomId: this.#roomId })
  }
}

export interface JobInfo {
  roomId: string
  language: LanguagePreference
}

/**
 * The token endpoint dispatches with AgentJobMetadata `{ "roomId": "...", "language": "auto" | "es" | ... }`.
 * Fallbacks: roomId from the room name `bed-<roomId>-<random>`, language "auto".
 */
export function resolveJob(metadata: string, roomName: string | undefined): JobInfo | undefined {
  let roomId: string | undefined
  let language: LanguagePreference = 'auto'
  if (metadata) {
    try {
      const parsed: unknown = JSON.parse(metadata)
      if (typeof parsed === 'object' && parsed !== null) {
        if ('roomId' in parsed && typeof parsed.roomId === 'string' && parsed.roomId.trim()) {
          roomId = parsed.roomId.trim()
        }
        if ('language' in parsed && isLanguagePreference(parsed.language)) {
          language = parsed.language
        }
      }
    } catch {
      // not JSON: fall through to the room name
    }
  }
  roomId ??= roomName?.match(/^bed-(.+)-[^-]+$/)?.[1]
  return roomId ? { roomId, language } : undefined
}

/** DRAFT_CONFIRMED_RPC payload: JSON `{ "draftId": "..." }`. */
export function parseDraftId(payload: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(payload)
    if (typeof parsed === 'object' && parsed !== null && 'draftId' in parsed) {
      const { draftId } = parsed
      if (typeof draftId === 'string' && draftId.trim()) return draftId.trim()
    }
  } catch {
    // not JSON
  }
  return undefined
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const logger = log().child({ jobId: ctx.job.id })
    const job = resolveJob(ctx.job.metadata, ctx.job.room?.name)
    if (!job) {
      logger.error('no roomId in job metadata or room name, leaving')
      ctx.shutdown('missing roomId')
      return
    }

    const env = agentEnv()
    // The room's language setting: "auto" lets Flux detect it; a chosen language biases Flux
    // toward it and fixes the TTS language. The router replies in it either way.
    const chosenLanguage = job.language === 'auto' ? undefined : job.language
    const session = new voice.AgentSession({
      // Flux multilingual. Flux decides when the turn ends.
      stt: new deepgram.STTv2({
        model: 'flux-general-multi',
        apiKey: env.deepgramApiKey,
        ...(chosenLanguage ? { languageHint: [chosenLanguage] } : {}),
      }),
      // eleven_v3* / eleven_v4* models go through ElevenLabs' text-to-dialogue websocket.
      tts: new elevenlabs.TTS({
        apiKey: env.elevenApiKey,
        voiceId: env.elevenVoiceId,
        model: env.elevenModel,
        ...(chosenLanguage ? { language: chosenLanguage } : {}),
      }),
      turnHandling: {
        turnDetection: 'stt',
        // In STT mode this delay is added after Flux's own end of turn; Flux already waited.
        endpointing: { minDelay: 0 },
      },
    })
    const agent = new BellAgent(job, {
      appUrl: env.appUrl,
      agentSharedSecret: env.agentSharedSecret,
    })

    // Connect first so the tablet's "tapped Send" RPC is registered before anything is spoken.
    await ctx.connect()
    const local = ctx.room.localParticipant
    if (local) {
      local.registerRpcMethod(DRAFT_CONFIRMED_RPC, (data) => agent.onDraftConfirmed(data))
    } else {
      logger.error('no local participant after connect; tablet confirmations will be missed')
    }

    await session.start({
      agent,
      room: ctx.room,
      // Typed text goes through the web app, and the default text handler needs an LLM.
      inputOptions: { textEnabled: false },
    })
    logger.info({ roomId: job.roomId, language: job.language }, 'voice session started')
  },
})
