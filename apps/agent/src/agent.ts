// Job entry for the voice worker. The worker forks a process per job and imports this file by
// path (see main.ts), so it must have no side effects beyond defining the agent.
//
// Two modes, from the dispatch metadata:
// - 'request': a terse conversation run by an LLM (Qwen on Cerebras) that calls tools.
//   - Every transcript first goes through a deterministic red-flag check. A hit notifies the
//     nurse immediately and the LLM never handles that turn.
//   - It opens with a short intro ("Go ahead, I'm listening.") that the patient can talk over.
//   - The LLM says a bare acknowledgement in the same reply as a tool call ("Got it.").
//     If a reply has no spoken text, the agent says the fixed "one moment" phrase itself, once.
//   - Tools return nothing at once and do their work in the background, so the conversation
//     keeps going and there is no second LLM round; the agent announces results itself.
// - 'emergency': no LLM. "I'm listening", then everything the patient says is added to the
//   emergency request's notes.
// Fixed phrases come from patientMessage() and play from pre-rendered audio (phrases.ts).
// Background voices are removed by LiveKit Cloud's BVC before the VAD and STT hear them, and an
// agent reply is only interrupted by at least 0.6 s and 2 words of patient speech.
// Patient-facing speech never names a team. Transcripts are never logged.
import {
  FLUX_LANGUAGES,
  isLanguagePreference,
  LANGUAGES,
  type LanguagePreference,
  patientMessage,
  REQUESTS_CANCELLED_RPC,
} from '@bell/core'
import {
  type ChatContext,
  type ChatMessage,
  defineAgent,
  type JobContext,
  llm,
  log,
  type stt,
  voice,
} from '@livekit/agents'
import * as deepgram from '@livekit/agents-plugin-deepgram'
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs'
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node'
import { z } from 'zod'
import { type AgentEnv, agentEnv, loadRootEnv } from './env'
import { interruptionWords, MIN_INTERRUPTION_MS, MIN_INTERRUPTION_WORDS } from './interruptions'
import { elevenLabsLanguage } from './languages'
import {
  ConversationLLM,
  chatStream,
  DEFAULT_HEDGE_AFTER_MS,
  GATEWAY_ROUTES,
  hedgeStream,
} from './llm'
import { PhraseCache } from './phrases'
import { buildInstructions, NOTE_PREFIX } from './prompt'
import { ScribeSTT } from './stt'
import { type Announcement, BellTools, EmergencyNotes } from './tools'

// The job process inherits the parent's env; loading again only matters when this file is
// imported on its own (e.g. console mode). Values already set win.
loadRootEnv()

const RED_FLAG_NOTE = `${NOTE_PREFIX} The patient said something urgent, so their nurse was told right away and the patient heard that.`
const RED_FLAG_FAILED_NOTE = `${NOTE_PREFIX} The patient said something urgent, but sending it failed; the patient was told to press the My nurse button.`

type LlmStream = NonNullable<Awaited<ReturnType<voice.Agent['llmNode']>>>
type LlmChunk = LlmStream extends ReadableStream<infer C> ? C : never

/** A real LLM output chunk: content (even whitespace) or a tool call; not usage-only. */
function isResponseChunk(chunk: LlmChunk): boolean {
  if (typeof chunk === 'string') return chunk.length > 0
  if (typeof chunk === 'object' && chunk !== null && 'delta' in chunk) {
    return Boolean(chunk.delta?.content || chunk.delta?.toolCalls?.length)
  }
  return false
}

/**
 * Before the first words: the chunk without its whitespace-only text (undefined to drop it).
 * Tool calls, usage and other chunks pass through unchanged.
 */
function withoutWhitespaceText(chunk: LlmChunk): LlmChunk | undefined {
  if (typeof chunk === 'string') return undefined
  if (typeof chunk === 'object' && chunk !== null && 'delta' in chunk && chunk.delta?.content) {
    if (chunk.delta.toolCalls?.length) return { ...chunk, delta: { ...chunk.delta, content: '' } }
    return chunk.usage ? { ...chunk, delta: undefined } : undefined
  }
  return chunk
}

/** True when an LLM output chunk carries text that will be spoken. */
function hasSpokenText(chunk: LlmChunk): boolean {
  if (typeof chunk === 'string') return chunk.trim().length > 0
  if (typeof chunk === 'object' && chunk !== null && 'delta' in chunk) {
    return (chunk.delta?.content?.trim().length ?? 0) > 0
  }
  return false
}

/**
 * Appends user-role messages to the agent's chat context. Notes are user messages with the
 * [bell] prefix, not system messages: Qwen's chat template on Cerebras rejects a system message
 * anywhere but first ("System message must be at the beginning").
 */
async function addToChat(agent: voice.Agent, contents: string[]): Promise<void> {
  const chatCtx = agent.chatCtx.copy()
  for (const content of contents) chatCtx.addMessage({ role: 'user', content })
  await agent.updateChatCtx(chatCtx)
}

/** Notes the event for the LLM, then speaks (if there is anything to say). */
async function announce(
  session: voice.AgentSession,
  phrases: PhraseCache,
  { say, followUp, note }: Announcement,
): Promise<void> {
  try {
    await addToChat(session.currentAgent, [note])
    if (say) phrases.say(session, say)
    if (followUp) phrases.say(session, followUp)
  } catch (error) {
    // the session is closing
    log().warn({ error: describeError(error) }, 'could not announce')
  }
}

export class BellAgent extends voice.Agent {
  readonly #bell: BellTools
  readonly #phrases: PhraseCache
  readonly #roomLanguage: LanguagePreference
  /** When the second attempt starts (gateway: backup providers; direct: identical request). */
  readonly #raceAfterMs: number
  /** Whether the LLM reply being generated has spoken text (the tool phrase). */
  #replyHasText = false
  /** Whether "One moment." was already said for this reply. */
  #fallbackSaid = false

  constructor(
    language: LanguagePreference,
    bell: BellTools,
    phrases: PhraseCache,
    options: { raceAfterMs?: number } = {},
  ) {
    super({ instructions: buildInstructions(language), tools: buildTools(bell) })
    this.#bell = bell
    this.#phrases = phrases
    this.#roomLanguage = language
    this.#raceAfterMs = options.raceAfterMs ?? DEFAULT_HEDGE_AFTER_MS
  }

  /** The patient just tapped the mic: a short intro they can talk over, then just listen. */
  override async onEnter(): Promise<void> {
    this.#phrases.say(this.session, patientMessage('listening_intro', this.#bell.messageLanguage))
  }

  /** Red flags never reach the LLM; everything else gets a normal LLM reply. */
  override async onUserTurnCompleted(chatCtx: ChatContext, newMessage: ChatMessage): Promise<void> {
    const text = newMessage.textContent?.trim() ?? ''
    if (!text) return
    this.#bell.heard({ text })
    const redFlag = await this.#bell.redFlagCheck(text)
    if (!redFlag) {
      // chatCtx is this reply's own copy, so the note does not pile up in the history.
      const note = languageNote(this.#roomLanguage, this.#bell.heardLanguage)
      if (note) chatCtx.addMessage({ role: 'user', content: note })
      return
    }

    // StopResponse drops the user message, so add it back with a note to keep the LLM in the loop.
    const note = redFlag.outcome === 'failed' ? RED_FLAG_FAILED_NOTE : RED_FLAG_NOTE
    await addToChat(this, [text, note])
    this.#phrases.say(this.session, redFlag.say)
    throw new voice.StopResponse()
  }

  /**
   * One LLM reply, raced. On the AI Gateway, attempt 1 is pinned to Cerebras (fastest median, but
   * it spikes) and attempt 2, started GATEWAY_RACE_MS later if nothing has arrived, to the backup
   * providers; on direct Cerebras, attempt 2 is an identical request. The first real chunk wins
   * and the other request is aborted (only the winner is forwarded, so tool calls never double).
   * Logs the winner and the time to first chunk every turn.
   * Whitespace before the first words is dropped, so a "stay silent" reply (Qwen sends "\n\n" for
   * talk not meant for it) is truly empty: no speech, no assistant message. Also watches for
   * spoken text, so a tool call without a phrase gets the fallback phrase.
   */
  override async llmNode(
    ...args: Parameters<voice.Agent['llmNode']>
  ): ReturnType<voice.Agent['llmNode']> {
    const [chatCtx, toolCtx, modelSettings] = args
    this.#replyHasText = false
    this.#fallbackSaid = false
    const model = this.session.llm
    const gateway = model instanceof ConversationLLM && model.kind === 'gateway'
    const start =
      model instanceof ConversationLLM
        ? async (attempt: 'primary' | 'hedge') => {
            const route = gateway
              ? GATEWAY_ROUTES[attempt === 'primary' ? 'primary' : 'backup']
              : undefined
            const params = {
              chatCtx,
              toolCtx,
              toolChoice: modelSettings.toolChoice,
              connOptions: this.session.connOptions.llmConnOptions,
            }
            return chatStream(model, params, route) as ReadableStream<LlmChunk>
          }
        : () => super.llmNode(...args)
    const stream = await hedgeStream(start, {
      afterMs: this.#raceAfterMs,
      isFirstChunk: isResponseChunk,
      onSettled: ({ fired, winner, firstChunkMs }) => {
        log().info(
          {
            path: gateway ? 'gateway' : 'cerebras',
            winner: gateway ? (winner === 'primary' ? 'cerebras' : 'backup') : winner,
            raced: fired,
            firstChunkMs: Math.round(firstChunkMs),
          },
          'llm first chunk',
        )
      },
    })
    if (!stream) return stream
    return stream.pipeThrough(
      new TransformStream<LlmChunk, LlmChunk>({
        transform: (chunk, controller) => {
          if (!this.#replyHasText) {
            if (hasSpokenText(chunk)) {
              this.#replyHasText = true
            } else {
              const kept = withoutWhitespaceText(chunk)
              if (kept !== undefined) controller.enqueue(kept)
              return
            }
          }
          controller.enqueue(chunk)
        },
      }),
    )
  }

  /**
   * Called when a tool starts. The phrase normally comes from the LLM in the same reply, ahead of
   * the call; if that reply had no text, say "One moment." once instead.
   */
  toolStarted(): void {
    if (this.#replyHasText || this.#fallbackSaid) return
    this.#fallbackSaid = true
    try {
      this.#phrases.say(this.session, patientMessage('one_moment', this.#bell.messageLanguage))
    } catch (error) {
      log().warn({ error: describeError(error) }, 'could not say the tool phrase')
    }
  }
}

function toolStarted(session: voice.AgentSession): void {
  const agent = session.currentAgent
  if (agent instanceof BellAgent) agent.toolStarted()
}

// Each tool returns nothing right away: with no output the framework skips the follow-up LLM
// reply, so the patient hears the phrase once. The work runs in the background and BellTools
// announces the result (and adds a [bell] note for the LLM).
function buildTools(bell: BellTools) {
  return {
    send_request: llm.tool({
      description:
        'Send one patient request to the hospital staff right away (no confirm step). Call once per ' +
        'need. Say only a bare acknowledgement like "Got it." in the same reply, never what they asked for. The call bell ' +
        'tells the patient when it is sent.',
      parameters: z.object({
        request: z.string().describe("The patient's own words for this one need."),
        readBack: z
          .string()
          .describe(
            'A very short description of what they want, in the patient\'s language, never naming a team. Example: "An extra blanket."',
          ),
        staffSummary: z
          .string()
          .describe(
            'One short line in English for staff. Example: "Patient would like an extra blanket."',
          ),
      }),
      execute: async (args, { ctx }) => {
        toolStarted(ctx.session)
        void bell.sendRequest(args)
        return undefined
      },
    }),
    cancel_request: llm.tool({
      description:
        'Cancel a request this conversation sent: the most recent one by default. To change a ' +
        'request, call this with change: true (and send_request with the new one if they already ' +
        'said it). Say only "Okay." (cancel) or "Sure, what instead?" (change) in the same reply.',
      parameters: z.object({
        which: z
          .string()
          .optional()
          .describe(`"last" (the default) or a request id from a ${NOTE_PREFIX} note.`),
        change: z
          .boolean()
          .optional()
          .describe('true when the patient wants to change it to something else, not just cancel.'),
      }),
      execute: async ({ which, change }, { ctx }) => {
        toolStarted(ctx.session)
        void bell.cancelRequest(which, { change: change === true })
        return undefined
      },
    }),
    call_my_nurse: llm.tool({
      description:
        "Tell the patient's nurse right away. Use when the patient asks for their nurse or mentions " +
        'symptoms, pain, feeling unwell, medication or anything medical. Say a short phrase like ' +
        '"Getting your nurse." in the same reply.',
      parameters: z.object({
        reason: z.string().describe('One short line in English for the nurse.'),
        clinical: z.boolean().describe('True for symptoms, pain, medication or anything medical.'),
      }),
      execute: async (args, { ctx }) => {
        toolStarted(ctx.session)
        void bell.callMyNurse(args)
        return undefined
      },
    }),
  }
}

/** Emergency mode: no LLM. Says "I'm listening", then appends every turn to the request's notes. */
export class EmergencyAgent extends voice.Agent {
  readonly #notes: EmergencyNotes
  readonly #phrases: PhraseCache
  readonly #roomLanguage: LanguagePreference
  #heardLanguage: string | undefined

  constructor(language: LanguagePreference, notes: EmergencyNotes, phrases: PhraseCache) {
    // No LLM is attached, so these instructions are never sent anywhere.
    super({ instructions: 'Emergency listening: notes go to the emergency request.' })
    this.#roomLanguage = language
    this.#notes = notes
    this.#phrases = phrases
  }

  heard(language: string | null): void {
    if (language) this.#heardLanguage = language
  }

  /** Room setting first, then what the STT heard, then English. */
  get language(): string {
    return this.#roomLanguage !== 'auto' ? this.#roomLanguage : (this.#heardLanguage ?? 'en')
  }

  override async onEnter(): Promise<void> {
    this.#phrases.say(this.session, patientMessage('emergency_listening', this.language))
  }

  override async onUserTurnCompleted(
    _chatCtx: ChatContext,
    newMessage: ChatMessage,
  ): Promise<void> {
    const text = newMessage.textContent?.trim() ?? ''
    const say = text ? await this.#notes.add(text, this.language) : undefined
    if (say) this.#phrases.say(this.session, say)
    throw new voice.StopResponse()
  }
}

export interface JobInfo {
  roomId: string
  language: LanguagePreference
  mode: 'request' | 'emergency'
  /** Set only for a usable emergency job. */
  emergencyRequestId: string | null
}

/**
 * The token endpoint dispatches with AgentJobMetadata
 * `{ roomId, language: "auto" | "es" | ..., mode: "request" | "emergency", emergencyRequestId }`.
 * Fallbacks: roomId from the room name `bed-<roomId>-<random>`, language "auto", mode "request".
 * An emergency without an emergencyRequestId falls back to "request".
 */
export function resolveJob(metadata: string, roomName: string | undefined): JobInfo | undefined {
  let roomId: string | undefined
  let language: LanguagePreference = 'auto'
  let emergencyRequestId: string | null = null
  let wantsEmergency = false
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
        wantsEmergency = 'mode' in parsed && parsed.mode === 'emergency'
        if (
          'emergencyRequestId' in parsed &&
          typeof parsed.emergencyRequestId === 'string' &&
          parsed.emergencyRequestId.trim()
        ) {
          emergencyRequestId = parsed.emergencyRequestId.trim()
        }
      }
    } catch {
      // not JSON: fall through to the room name
    }
  }
  roomId ??= roomName?.match(/^bed-(.+)-[^-]+$/)?.[1]
  if (!roomId) return undefined
  const emergency = wantsEmergency && emergencyRequestId !== null
  return {
    roomId,
    language,
    mode: emergency ? 'emergency' : 'request',
    emergencyRequestId: emergency ? emergencyRequestId : null,
  }
}

/** REQUESTS_CANCELLED_RPC payload: JSON `{ "requestIds": ["..."] }`. */
export function parseRequestIds(payload: string): string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(payload)
    if (typeof parsed === 'object' && parsed !== null && 'requestIds' in parsed) {
      const { requestIds } = parsed
      if (Array.isArray(requestIds)) {
        return requestIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      }
    }
  } catch {
    // not JSON
  }
  return undefined
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function speechModels(env: AgentEnv, language: LanguagePreference, onLost: () => void) {
  const ttsLanguage = elevenLabsLanguage(language)
  return {
    stt: speechToText(env, language, onLost),
    // eleven_v3* / eleven_v4* models go through ElevenLabs' text-to-dialogue websocket.
    tts: new elevenlabs.TTS({
      apiKey: env.elevenApiKey,
      voiceId: env.elevenVoiceId,
      model: env.elevenModel,
      ...(ttsLanguage ? { language: ttsLanguage } : {}),
    }),
  }
}

/**
 * ElevenLabs Scribe transcribes, with MAI-Transcribe (AI Gateway) as its backup (see stt.ts); both
 * detect the language, and a room language becomes a hint where each has it. Deepgram Flux is the
 * alternative (STT_PROVIDER=deepgram); it only gets a hint for a Flux language. Either way the
 * STT's end of utterance ends the turn (turnDetection 'stt').
 */
function speechToText(env: AgentEnv, language: LanguagePreference, onLost: () => void): stt.STT {
  if (env.stt.provider === 'scribe') {
    const { backup } = env.stt
    return new ScribeSTT({
      scribe: { apiKey: env.stt.apiKey, model: env.stt.model, stallMs: env.stt.stallMs },
      ...(backup.kind === 'mai' ? { mai: { apiKey: backup.aiGatewayApiKey } } : {}),
      language,
      onLost,
    })
  }
  const fluxHint = (FLUX_LANGUAGES as readonly string[]).includes(language)
  return new deepgram.STTv2({
    model: 'flux-general-multi',
    apiKey: env.stt.deepgramApiKey,
    ...(fluxHint ? { languageHint: [language] } : {}),
  })
}

/** For a room on auto: which language the STT heard, so the LLM replies in it. */
export function languageNote(
  roomLanguage: LanguagePreference,
  heard: string | undefined,
): string | undefined {
  if (roomLanguage !== 'auto' || !heard) return undefined
  const label = LANGUAGES.find((l) => l.code === heard)?.label ?? heard
  return `${NOTE_PREFIX} The patient is speaking ${label} (${heard}). Reply in ${label}.`
}

const TURN_HANDLING = {
  turnDetection: 'stt',
  // In STT mode this delay is added after Flux's own end of turn; Flux already waited.
  endpointing: { minDelay: 0 },
  // The LLM must not start before the red-flag check in onUserTurnCompleted has run.
  preemptiveGeneration: { enabled: false },
  // 'vad': deterministic duration/word gating. The default 'adaptive' detector is a LiveKit
  // Inference service that falls back to VAD after an unrecoverable error anyway.
  interruption: {
    mode: 'vad',
    minDuration: MIN_INTERRUPTION_MS,
    minWords: MIN_INTERRUPTION_WORDS,
  },
} as const

/**
 * The session reads its interruption options on every check, so this follows the language the
 * STT hears (the options object is per session, not shared).
 */
function followLanguageForInterruptions(session: voice.AgentSession, language: string | null) {
  session.sessionOptions.turnHandling.interruption.minWords = interruptionWords(language)
}

/** LiveKit Cloud background voice cancellation (Krisp BVC), unless NOISE_CANCELLATION=off. */
function noiseCancellation(env: AgentEnv, logger: { warn: (o: object, m: string) => void }) {
  if (env.noiseCancellation === 'off') return {}
  try {
    return { noiseCancellation: BackgroundVoiceCancellation() }
  } catch (error) {
    // e.g. an unsupported platform for the native filter
    logger.warn({ error: describeError(error) }, 'background voice cancellation unavailable')
    return {}
  }
}

/** The fixed phrases worth pre-rendering for a language. */
function fixedPhrases(language: string, mode: 'request' | 'emergency'): string[] {
  if (mode === 'emergency') {
    return [
      patientMessage('emergency_listening', language),
      patientMessage('emergency_noted', language),
      patientMessage('say_again', language),
    ]
  }
  return (
    [
      'listening_intro',
      'one_moment',
      'sent',
      'sent_two',
      'sent_many',
      'change_hint',
      'cancelled',
      'nurse_notified',
      'save_failed',
      'say_again',
    ] as const
  ).map((key) => patientMessage(key, language))
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
    const api = { appUrl: env.appUrl, agentSharedSecret: env.agentSharedSecret }
    const roomLogger = log().child({ roomId: job.roomId })
    // Speech could not be transcribed: ask them to repeat (set once the
    // session exists).
    let onLost = () => {}
    const models = speechModels(env, job.language, () => onLost())
    const phrases = new PhraseCache({
      tts: models.tts,
      voiceKey: `${env.elevenModel}|${env.elevenVoiceId ?? 'default'}`,
      logger: roomLogger,
    })
    // Room on auto: English until the STT hears otherwise (then that language is warmed too).
    const startLanguage = job.language === 'auto' ? 'en' : job.language
    phrases.warm(fixedPhrases(startLanguage, job.mode))
    const inputOptions = { textEnabled: false, ...noiseCancellation(env, logger) }

    if (job.mode === 'emergency' && job.emergencyRequestId) {
      const session = new voice.AgentSession({ ...models, turnHandling: TURN_HANDLING })
      followLanguageForInterruptions(session, startLanguage)
      const agent = new EmergencyAgent(
        job.language,
        new EmergencyNotes({ requestId: job.emergencyRequestId, api, logger: roomLogger }),
        phrases,
      )
      onLost = () => {
        phrases.say(session, patientMessage('say_again', agent.language))
      }
      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
        if (!ev.isFinal) return
        agent.heard(ev.language)
        followLanguageForInterruptions(session, ev.language)
      })
      await session.start({ agent, room: ctx.room, inputOptions })
      logger.info({ roomId: job.roomId, mode: job.mode }, 'voice session started')
      return
    }

    const session = new voice.AgentSession({
      ...models,
      llm: new ConversationLLM({
        kind: env.llm.provider,
        apiKey: env.llm.apiKey,
        model: env.llm.model,
        reasoningEffort: env.cerebrasAgentReasoningEffort,
      }),
      turnHandling: TURN_HANDLING,
    })
    followLanguageForInterruptions(session, startLanguage)
    const bell = new BellTools({
      roomId: job.roomId,
      roomLanguage: job.language,
      api,
      logger: roomLogger,
      announce: (announcement) => void announce(session, phrases, announcement),
    })
    onLost = () => {
      phrases.say(session, patientMessage('say_again', bell.messageLanguage))
    }
    const warmed = new Set<string>([startLanguage])
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (!ev.isFinal) return
      bell.heard({ language: ev.language })
      followLanguageForInterruptions(session, ev.language)
      if (ev.language && !warmed.has(ev.language)) {
        warmed.add(ev.language)
        phrases.warm(fixedPhrases(ev.language, 'request'))
      }
    })
    session.on(voice.AgentSessionEventTypes.Close, () => bell.close())

    // The tablet's Delete button (in-panel card): { requestIds }. Connect first so it is ready.
    await ctx.connect()
    const local = ctx.room.localParticipant
    if (local) {
      local.registerRpcMethod(REQUESTS_CANCELLED_RPC, async (data) => {
        const requestIds = parseRequestIds(data.payload)
        if (!requestIds) return 'invalid'
        return bell.tabletCancelled(requestIds) ? 'ok' : 'noted'
      })
    } else {
      logger.error('no local participant after connect; tablet cancellations will be missed')
    }

    await session.start({
      agent: new BellAgent(job.language, bell, phrases, {
        raceAfterMs: env.llm.provider === 'gateway' ? env.llm.raceMs : env.llm.hedgeMs,
      }),
      room: ctx.room,
      // Typed text goes through the web app.
      inputOptions,
    })
    logger.info(
      {
        roomId: job.roomId,
        mode: job.mode,
        language: job.language,
        stt: env.stt.provider === 'scribe' ? `scribe+${env.stt.backup.kind}` : env.stt.provider,
        noiseCancellation: 'noiseCancellation' in inputOptions ? 'bvc' : 'off',
        llm: `${env.llm.provider}:${env.llm.model}`,
        reasoningEffort: env.cerebrasAgentReasoningEffort,
      },
      'voice session started',
    )
  },
})
