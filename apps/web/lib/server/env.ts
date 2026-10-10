// Server-only environment access. Read at call time so values loaded from the
// repo-root `.env` (see next.config.ts) are always current. Never log these values.

const read = (name: string): string | undefined => {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export const databaseUrl = (): string | undefined => read('DATABASE_URL')

export const agentSharedSecret = (): string | undefined => read('AGENT_SHARED_SECRET')

export interface LiveKitConfig {
  url: string
  apiKey: string
  apiSecret: string
}

export const liveKitConfig = (): LiveKitConfig | null => {
  const url = read('LIVEKIT_URL')
  const apiKey = read('LIVEKIT_API_KEY')
  const apiSecret = read('LIVEKIT_API_SECRET')
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null
}

export const isVoiceConfigured = (): boolean => liveKitConfig() !== null
