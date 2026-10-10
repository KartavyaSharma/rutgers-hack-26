// Environment for the voice worker. Everything lives in one .env at the repo root.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** apps/agent/src -> repo root */
const ROOT_ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url))

/** Loads <repo-root>/.env into process.env when it exists. Variables already set in the environment win. */
export function loadRootEnv(): void {
  if (existsSync(ROOT_ENV_FILE)) process.loadEnvFile(ROOT_ENV_FILE)
}

/** Without these the worker can't do anything useful, so it stays off. */
const REQUIRED_KEYS = [
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'ELEVEN_API_KEY',
  'CEREBRAS_API_KEY',
  'AGENT_SHARED_SECRET',
] as const

export const STT_PROVIDERS = ['mai', 'deepgram'] as const
export type SttProvider = (typeof STT_PROVIDERS)[number]
/** The key each speech-to-text provider needs. */
const STT_KEYS = { mai: 'AI_GATEWAY_API_KEY', deepgram: 'DEEPGRAM_API_KEY' } as const

export const DEFAULT_ELEVEN_MODEL = 'eleven_v4_turbo'
export const DEFAULT_APP_URL = 'http://localhost:3000'
/** The conversation LLM. The request classifier has its own settings in @bell/core. */
export const DEFAULT_CEREBRAS_AGENT_MODEL = 'qwen-3.8-27b'
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]
/** Kurt's default for snappier replies; CEREBRAS_AGENT_REASONING_EFFORT overrides it. */
export const DEFAULT_CEREBRAS_AGENT_REASONING_EFFORT: ReasoningEffort = 'low'

const isReasoningEffort = (value: unknown): value is ReasoningEffort =>
  typeof value === 'string' && (REASONING_EFFORTS as readonly string[]).includes(value)

const isSttProvider = (value: unknown): value is SttProvider =>
  typeof value === 'string' && (STT_PROVIDERS as readonly string[]).includes(value)

/** Trimmed value, or undefined when unset or empty (.env.example ships empty keys). */
function read(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function required(name: string): string {
  const value = read(name)
  if (value === undefined) throw new Error(`${name} is not set`)
  return value
}

/**
 * STT_PROVIDER ("mai" | "deepgram"). Default: MAI-Transcribe through the AI Gateway when
 * AI_GATEWAY_API_KEY is set, else Deepgram Flux.
 */
export function sttProvider(): SttProvider {
  const chosen = read('STT_PROVIDER')?.toLowerCase()
  if (isSttProvider(chosen)) return chosen
  return read(STT_KEYS.mai) ? 'mai' : 'deepgram'
}

/** Names of required variables that are missing. Never returns values. */
export function missingEnv(): string[] {
  const keys = [...REQUIRED_KEYS, STT_KEYS[sttProvider()]]
  return keys.filter((key) => read(key) === undefined)
}

/** Set-but-unusable optional variables, as one-line warnings (names and allowed values only). */
export function envWarnings(): string[] {
  const warnings: string[] = []
  const effort = read('CEREBRAS_AGENT_REASONING_EFFORT')
  if (effort !== undefined && !isReasoningEffort(effort)) {
    warnings.push(
      `CEREBRAS_AGENT_REASONING_EFFORT must be one of ${REASONING_EFFORTS.join(', ')}; using ${DEFAULT_CEREBRAS_AGENT_REASONING_EFFORT}`,
    )
  }
  const nc = read('NOISE_CANCELLATION')?.toLowerCase()
  if (nc !== undefined && nc !== 'bvc' && nc !== 'off') {
    warnings.push('NOISE_CANCELLATION must be bvc or off; using bvc')
  }
  const provider = read('STT_PROVIDER')
  if (provider !== undefined && !isSttProvider(provider.toLowerCase())) {
    warnings.push(`STT_PROVIDER must be one of ${STT_PROVIDERS.join(', ')}; using ${sttProvider()}`)
  }
  return warnings
}

export type SttEnv =
  | { provider: 'mai'; aiGatewayApiKey: string }
  | { provider: 'deepgram'; deepgramApiKey: string }

export interface AgentEnv {
  stt: SttEnv
  /** NOISE_CANCELLATION: 'bvc' (default, LiveKit Cloud background voice cancellation) or 'off'. */
  noiseCancellation: 'bvc' | 'off'
  elevenApiKey: string
  /** undefined means the ElevenLabs plugin's default voice. */
  elevenVoiceId: string | undefined
  elevenModel: string
  cerebrasApiKey: string
  cerebrasAgentModel: string
  cerebrasAgentReasoningEffort: ReasoningEffort
  /** Base URL of the web app, without a trailing slash. */
  appUrl: string
  agentSharedSecret: string
}

/** Typed env for the job process. Throws if a required variable is missing. */
export function agentEnv(): AgentEnv {
  const effort = read('CEREBRAS_AGENT_REASONING_EFFORT')
  const provider = sttProvider()
  return {
    stt:
      provider === 'mai'
        ? { provider, aiGatewayApiKey: required(STT_KEYS.mai) }
        : { provider, deepgramApiKey: required(STT_KEYS.deepgram) },
    noiseCancellation: read('NOISE_CANCELLATION')?.toLowerCase() === 'off' ? 'off' : 'bvc',
    elevenApiKey: required('ELEVEN_API_KEY'),
    elevenVoiceId: read('ELEVEN_VOICE_ID'),
    elevenModel: read('ELEVEN_MODEL') ?? DEFAULT_ELEVEN_MODEL,
    cerebrasApiKey: required('CEREBRAS_API_KEY'),
    cerebrasAgentModel: read('CEREBRAS_AGENT_MODEL') ?? DEFAULT_CEREBRAS_AGENT_MODEL,
    cerebrasAgentReasoningEffort: isReasoningEffort(effort)
      ? effort
      : DEFAULT_CEREBRAS_AGENT_REASONING_EFFORT,
    appUrl: (read('APP_URL') ?? DEFAULT_APP_URL).replace(/\/+$/, ''),
    agentSharedSecret: required('AGENT_SHARED_SECRET'),
  }
}
