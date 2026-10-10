import { createHash, timingSafeEqual } from 'node:crypto'
import { agentSharedSecret } from './env'

const digest = (value: string) => createHash('sha256').update(value).digest()

/**
 * True when the request carries `Authorization: Bearer <AGENT_SHARED_SECRET>`.
 * Always false when the secret is not configured, so routed posts are rejected.
 */
export const isAgentRequest = (request: Request): boolean => {
  const secret = agentSharedSecret()
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match?.[1]) return false
  // Compare fixed-length digests so the check does not leak the secret's length or prefix.
  return timingSafeEqual(digest(match[1]), digest(secret))
}
