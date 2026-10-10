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
  'DEEPGRAM_API_KEY',
  'ELEVEN_API_KEY',
  'AGENT_SHARED_SECRET',
] as const

export const DEFAULT_ELEVEN_MODEL = 'eleven_v4_turbo'
export const DEFAULT_APP_URL = 'http://localhost:3000'

/** Trimmed value, or undefined when unset or empty (.env.example ships empty keys). */
function read(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function required(name: (typeof REQUIRED_KEYS)[number]): string {
  const value = read(name)
  if (value === undefined) throw new Error(`${name} is not set`)
  return value
}

/** Names of required variables that are missing. Never returns values. */
export function missingEnv(): string[] {
  return REQUIRED_KEYS.filter((key) => read(key) === undefined)
}

export interface AgentEnv {
  deepgramApiKey: string
  elevenApiKey: string
  /** undefined means the ElevenLabs plugin's default voice. */
  elevenVoiceId: string | undefined
  elevenModel: string
  /** Base URL of the web app, without a trailing slash. */
  appUrl: string
  agentSharedSecret: string
}

/** Typed env for the job process. Throws if a required variable is missing. */
export function agentEnv(): AgentEnv {
  return {
    deepgramApiKey: required('DEEPGRAM_API_KEY'),
    elevenApiKey: required('ELEVEN_API_KEY'),
    elevenVoiceId: read('ELEVEN_VOICE_ID'),
    elevenModel: read('ELEVEN_MODEL') ?? DEFAULT_ELEVEN_MODEL,
    appUrl: (read('APP_URL') ?? DEFAULT_APP_URL).replace(/\/+$/, ''),
    agentSharedSecret: required('AGENT_SHARED_SECRET'),
  }
}
