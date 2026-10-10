// Job entry for the voice worker. The worker forks a process per job and imports this file by
// path (see main.ts), so it must have no side effects beyond defining the agent.
//
// Two modes, from the dispatch metadata:
// - 'request': a terse conversation run by an LLM (Qwen on Cerebras) that calls tools.
//   - Every transcript first goes through a deterministic red-flag check. A hit notifies the
//     nurse immediately and the LLM never handles that turn.
//   - The LLM says a short phrase in the same reply as a tool call ("Okay, sending that now.").
//     If a reply has no spoken text, the agent says "One moment." itself, once.
//   - Tools return nothing at once and do their work in the background, so the conversation
//     keeps going and there is no second LLM round; the agent announces results itself
//     ("A pillow and some water. Sent. Someone will be with you soon.").
// - 'emergency': no LLM. "I'm listening", then everything the patient says is added to the
//   emergency request's notes.
// Patient-facing speech never names a team. Transcripts are never logged.
import { isLanguagePreference, type LanguagePreference, patientMessage } from '@bell/core'
import {
  type ChatContext,
  type ChatMessage,
  defineAgent,
  type JobContext,
  llm,
  log,
  voice,
} from '@livekit/agents'
import * as deepgram from '@livekit/agents-plugin-deepgram'
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs'
import { z } from 'zod'
import { type AgentEnv, agentEnv, loadRootEnv } from './env'
import { ConversationLLM } from './llm'
import { buildInstructions, NOTE_PREFIX } from './prompt'
import { type Announcement, BellTools, EmergencyNotes } from './tools'

// The job process inherits the parent's env; loading again only matters when this file is
// imported on its own (e.g. console mode). Values already set win.
loadRootEnv()

const RED_FLAG_NOTE = `${NOTE_PREFIX} The patient said something urgent, so their nurse was told right away and the patient heard that.`
const RED_FLAG_FAILED_NOTE = `${NOTE_PREFIX} The patient said something urgent, but sending it failed; the patient was told to press the My nurse button.`

type LlmStream = NonNullable<Awaited<ReturnType<voice.Agent['llmNode']>>>
type LlmChunk = LlmStream extends ReadableStream<infer C> ? C : never

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
async function announce(session: voice.AgentSession, { say, note }: Announcement): Promise<void> {
  try {
    await addToChat(session.currentAgent, [note])
    if (say) session.say(say)
  } catch (error) {
    // the session is closing
    log().warn({ error: describeError(error) }, 'could not announce')
  }
}

export class BellAgent extends voice.Agent {
  readonly #bell: BellTools
  /** Whether the LLM reply being generated has spoken text (the tool phrase). */
  #replyHasText = false
  /** Whether "One moment." was already said for this reply. */
  #fallbackSaid = false

  constructor(language: LanguagePreference, bell: BellTools) {
    super({ instructions: buildInstructions(language), tools: buildTools(bell) })
    this.#bell = bell
  }

  /** Red flags never reach the LLM; everything else gets a normal LLM reply. */
  override async onUserTurnCompleted(
    _chatCtx: ChatContext,
    newMessage: ChatMessage,
  ): Promise<void> {
    const text = newMessage.textContent?.trim() ?? ''
    if (!text) return
    this.#bell.heard({ text })
    const redFlag = await this.#bell.redFlagCheck(text)
    if (!redFlag) return

    // StopResponse drops the user message, so add it back with a note to keep the LLM in the loop.
    const note = redFlag.outcome === 'failed' ? RED_FLAG_FAILED_NOTE : RED_FLAG_NOTE
    await addToChat(this, [text, note])
    this.session.say(redFlag.say)
    throw new voice.StopResponse()
  }

  /** Watches each reply for spoken text, so a tool call without a phrase gets the fallback. */
  override async llmNode(
    ...args: Parameters<voice.Agent['llmNode']>
  ): ReturnType<voice.Agent['llmNode']> {
    this.#replyHasText = false
    this.#fallbackSaid = false
    const stream = await super.llmNode(...args)
    if (!stream) return stream
    return stream.pipeThrough(
      new TransformStream<LlmChunk, LlmChunk>({
        transform: (chunk, controller) => {
          if (!this.#replyHasText && hasSpokenText(chunk)) this.#replyHasText = true
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
      this.session.say(patientMessage('one_moment', this.#bell.messageLanguage))
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
        'need. Say a short phrase like "Okay, sending that now." in the same reply. The call bell ' +
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
        'Cancel a request this conversation sent: the most recent one by default. For a correction, ' +
        'call this first, then send_request with the corrected request. Say a short phrase like ' +
        '"Okay, cancelling that." in the same reply.',
      parameters: z.object({
        which: z
          .string()
          .optional()
          .describe(`"last" (the default) or a request id from a ${NOTE_PREFIX} note.`),
      }),
      execute: async ({ which }, { ctx }) => {
        toolStarted(ctx.session)
        void bell.cancelRequest(which)
        return undefined
      },
    }),
    call_my_nurse: llm.tool({
      description:
        "Tell the patient's nurse right away. Use when the patient asks for their nurse or mentions " +
        'symptoms, pain, feeling unwell, medication or anything medical. Say a short phrase like ' +
        '"I\'m getting your nurse." in the same reply.',
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
  readonly #roomLanguage: LanguagePreference
  #heardLanguage: string | undefined

  constructor(language: LanguagePreference, notes: EmergencyNotes) {
    // No LLM is attached, so these instructions are never sent anywhere.
    super({ instructions: 'Emergency listening: notes go to the emergency request.' })
    this.#roomLanguage = language
    this.#notes = notes
  }

  heard(language: string | null): void {
    if (language) this.#heardLanguage = language
  }

  get #language(): string {
    return this.#roomLanguage !== 'auto' ? this.#roomLanguage : (this.#heardLanguage ?? 'en')
  }

  override async onEnter(): Promise<void> {
    this.session.say(patientMessage('emergency_listening', this.#language))
  }

  override async onUserTurnCompleted(
    _chatCtx: ChatContext,
    newMessage: ChatMessage,
  ): Promise<void> {
    const text = newMessage.textContent?.trim() ?? ''
    const say = text ? await this.#notes.add(text, this.#language) : undefined
    if (say) this.session.say(say)
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

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function speechModels(env: AgentEnv, language: LanguagePreference) {
  // The room's language setting: "auto" lets Flux detect it; a chosen language biases Flux
  // toward it and fixes the TTS language.
  const chosen = language === 'auto' ? undefined : language
  return {
    // Flux multilingual. Flux decides when the turn ends.
    stt: new deepgram.STTv2({
      model: 'flux-general-multi',
      apiKey: env.deepgramApiKey,
      ...(chosen ? { languageHint: [chosen] } : {}),
    }),
    // eleven_v3* / eleven_v4* models go through ElevenLabs' text-to-dialogue websocket.
    tts: new elevenlabs.TTS({
      apiKey: env.elevenApiKey,
      voiceId: env.elevenVoiceId,
      model: env.elevenModel,
      ...(chosen ? { language: chosen } : {}),
    }),
  }
}

const TURN_HANDLING = {
  turnDetection: 'stt',
  // In STT mode this delay is added after Flux's own end of turn; Flux already waited.
  endpointing: { minDelay: 0 },
  // The LLM must not start before the red-flag check in onUserTurnCompleted has run.
  preemptiveGeneration: { enabled: false },
} as const

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

    if (job.mode === 'emergency' && job.emergencyRequestId) {
      const session = new voice.AgentSession({
        ...speechModels(env, job.language),
        turnHandling: TURN_HANDLING,
      })
      const agent = new EmergencyAgent(
        job.language,
        new EmergencyNotes({ requestId: job.emergencyRequestId, api, logger: roomLogger }),
      )
      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
        if (ev.isFinal) agent.heard(ev.language)
      })
      await session.start({ agent, room: ctx.room, inputOptions: { textEnabled: false } })
      logger.info({ roomId: job.roomId, mode: job.mode }, 'voice session started')
      return
    }

    const session = new voice.AgentSession({
      ...speechModels(env, job.language),
      llm: new ConversationLLM({
        apiKey: env.cerebrasApiKey,
        model: env.cerebrasAgentModel,
        reasoningEffort: env.cerebrasAgentReasoningEffort,
      }),
      turnHandling: TURN_HANDLING,
    })
    const bell = new BellTools({
      roomId: job.roomId,
      roomLanguage: job.language,
      api,
      logger: roomLogger,
      announce: (announcement) => void announce(session, announcement),
    })
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (ev.isFinal) bell.heard({ language: ev.language })
    })
    session.on(voice.AgentSessionEventTypes.Close, () => bell.close())

    await session.start({
      agent: new BellAgent(job.language, bell),
      room: ctx.room,
      // Typed text goes through the web app.
      inputOptions: { textEnabled: false },
    })
    logger.info(
      {
        roomId: job.roomId,
        mode: job.mode,
        language: job.language,
        llm: env.cerebrasAgentModel,
        reasoningEffort: env.cerebrasAgentReasoningEffort,
      },
      'voice session started',
    )
  },
})
