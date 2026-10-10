// Job entry for the voice worker. The worker forks a process per job and imports this file by
// path (see main.ts), so it must have no side effects beyond defining the agent.
//
// A normal conversation run by an LLM (Qwen on Cerebras) that calls tools to classify a request
// and send it to the right people:
// - Every transcript first goes through a deterministic red-flag check. A hit notifies the nurse
//   immediately and the LLM never handles that turn.
// - classify_and_draft is a native async tool: its first ctx.update() hands control back to the
//   LLM, classification and draft creation run in the background, and the agent then speaks the
//   read-back (or "nurse notified") itself, with no extra LLM round.
// - confirm_draft / cancel_draft act on the one pending draft; call_my_nurse is immediate.
// - The tablet's Send tap arrives as the DRAFT_CONFIRMED_RPC.
// Drafts never send on their own. Patient-facing speech never names a team. Transcripts are
// never logged.
import {
  DRAFT_CONFIRMED_RPC,
  isLanguagePreference,
  type LanguagePreference,
  patientMessage,
} from '@bell/core'
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
import type { RpcInvocationData } from '@livekit/rtc-node'
import { z } from 'zod'
import { agentEnv, loadRootEnv } from './env'
import { ConversationLLM } from './llm'
import { buildInstructions, NOTE_PREFIX } from './prompt'
import { BellTools, type ClassifyOutcome } from './tools'

// The job process inherits the parent's env; loading again only matters when this file is
// imported on its own (e.g. console mode). Values already set win.
loadRootEnv()

const NOTES = {
  draft: (draftId: string, readBack: string) =>
    `${NOTE_PREFIX} A request is waiting for the patient's yes (draft ${draftId}): "${readBack}". It was read back and the patient was asked to say yes or tap Send.`,
  nurseNow: `${NOTE_PREFIX} That request was urgent or medical, so it went to the nurse right away. Nothing to confirm.`,
  redFlag: `${NOTE_PREFIX} The patient said something urgent, so their nurse was told right away and the patient heard that. Nothing to confirm.`,
  tapped: `${NOTE_PREFIX} The patient tapped Send on the tablet, so the waiting request was sent. Nothing to confirm.`,
  failed: `${NOTE_PREFIX} Saving that request failed; the patient was told to press the My nurse button.`,
}

const WORKING = {
  outcome: 'working',
  note: 'The call bell will read the request back to the patient by itself in a moment. Say nothing, or only a very short "one moment".',
} as const

const optionalDraftId = z.object({
  draftId: z.string().optional().describe('The waiting draft id, if you know it.'),
})

function buildTools(bell: BellTools) {
  return {
    classify_and_draft: llm.tool({
      description:
        'Classify a patient request and prepare it as a draft that waits for the patient to confirm. ' +
        'Runs in the background; the call bell itself reads the request back and asks the patient to ' +
        'say yes or tap Send. Urgent or medical requests go straight to the nurse instead.',
      parameters: z.object({
        request: z.string().describe("The patient's own words for the request."),
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
        // Native async tool: the first update goes back to the LLM at once and this call keeps
        // running in the background, so the conversation continues meanwhile.
        await ctx.update(WORKING)
        const result = await bell.classifyAndDraft(args)
        await deliver(ctx.session, result)
        // Already spoken; returning nothing skips the framework's deferred LLM reply.
        return undefined
      },
    }),
    confirm_draft: llm.tool({
      description:
        'Send the waiting request. Call ONLY after the patient clearly says yes to the request that was just read back.',
      parameters: optionalDraftId,
      execute: ({ draftId }) => bell.confirmDraft(draftId),
    }),
    cancel_draft: llm.tool({
      description:
        'Cancel the waiting request, when the patient says no or never mind, or before re-drafting a correction.',
      parameters: optionalDraftId,
      execute: ({ draftId }) => bell.cancelDraft(draftId),
    }),
    call_my_nurse: llm.tool({
      description:
        "Tell the patient's nurse right away, with no read-back or confirmation. Use when the patient asks " +
        'for their nurse or mentions symptoms, pain, feeling unwell, medication or anything medical.',
      parameters: z.object({
        reason: z.string().describe('One short line in English for the nurse.'),
        clinical: z.boolean().describe('True for symptoms, pain, medication or anything medical.'),
      }),
      execute: (args) => bell.callMyNurse(args),
    }),
  }
}

/** Speaks a background classification result and tells the LLM what happened. */
async function deliver(session: voice.AgentSession, result: ClassifyOutcome): Promise<void> {
  if (result.outcome === 'superseded') return
  const note =
    result.outcome === 'draft'
      ? NOTES.draft(result.draftId, result.readBack)
      : result.outcome === 'sent_to_nurse_now'
        ? NOTES.nurseNow
        : result.outcome === 'sent'
          ? NOTES.tapped
          : NOTES.failed
  try {
    await addToChat(session.currentAgent, [note])
    session.say(result.say)
  } catch (error) {
    // the session is closing
    log().warn({ error: describeError(error) }, 'could not deliver a request result')
  }
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

export class BellAgent extends voice.Agent {
  readonly #bell: BellTools

  constructor(job: JobInfo, bell: BellTools) {
    super({ instructions: buildInstructions(job.language), tools: buildTools(bell) })
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
    await addToChat(this, [text, redFlag.outcome === 'failed' ? NOTES.failed : NOTES.redFlag])
    this.session.say(redFlag.say)
    throw new voice.StopResponse()
  }

  /**
   * RPC from the tablet after the patient tapped Send. The tablet already confirmed through the
   * API; this marks the draft sent (so confirm_draft becomes a no-op) and tells the patient.
   */
  async onDraftConfirmed(data: RpcInvocationData): Promise<string> {
    const draftId = parseDraftId(data.payload)
    if (!draftId) return 'invalid'
    const result = this.#bell.tabletConfirmed(draftId)
    if (!result.matched) return 'ignored'
    try {
      await addToChat(this, [NOTES.tapped])
      this.session.say(patientMessage('sent', result.language))
    } catch (error) {
      // the session is closing
      log().warn({ error: describeError(error) }, 'could not speak after tablet confirm')
    }
    return 'ok'
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
    const bell = new BellTools({
      roomId: job.roomId,
      roomLanguage: job.language,
      api: { appUrl: env.appUrl, agentSharedSecret: env.agentSharedSecret },
      logger: log().child({ roomId: job.roomId }),
    })

    // The room's language setting: "auto" lets Flux detect it; a chosen language biases Flux
    // toward it and fixes the TTS language. The LLM and the router reply in it either way.
    const chosenLanguage = job.language === 'auto' ? undefined : job.language
    const session = new voice.AgentSession({
      // Flux multilingual. Flux decides when the turn ends.
      stt: new deepgram.STTv2({
        model: 'flux-general-multi',
        apiKey: env.deepgramApiKey,
        ...(chosenLanguage ? { languageHint: [chosenLanguage] } : {}),
      }),
      llm: new ConversationLLM({
        apiKey: env.cerebrasApiKey,
        model: env.cerebrasAgentModel,
        reasoningEffort: env.cerebrasAgentReasoningEffort,
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
        // The LLM must not start before the red-flag check in onUserTurnCompleted has run.
        preemptiveGeneration: { enabled: false },
      },
    })
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (ev.isFinal) bell.heard({ language: ev.language })
    })

    const agent = new BellAgent(job, bell)

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
      // Typed text goes through the web app.
      inputOptions: { textEnabled: false },
    })
    logger.info(
      {
        roomId: job.roomId,
        language: job.language,
        llm: env.cerebrasAgentModel,
        reasoningEffort: env.cerebrasAgentReasoningEffort,
      },
      'voice session started',
    )
  },
})
