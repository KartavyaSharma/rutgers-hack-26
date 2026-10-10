import { randomBytes } from 'node:crypto'
import { AGENT_NAME, type AgentJobMetadata } from '@bell/core/taxonomy'
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk'
import type { NextRequest } from 'next/server'
import { liveKitConfig } from '@/lib/server/env'
import { badRequest, json, readJsonObject, serverError } from '@/lib/server/http'
import { parseLanguage, parseRoomId } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/livekit/token { roomId, language? }: a patient token for a fresh LiveKit room with the agent dispatched. */
export async function POST(request: NextRequest) {
  const config = liveKitConfig()
  if (!config) return json({ error: 'voice_not_configured' }, 503)

  const body = await readJsonObject(request)
  if (!body.ok) return badRequest(body.message)
  const roomId = parseRoomId(body.value.roomId)
  if (!roomId.ok) return badRequest(roomId.message)
  const language = parseLanguage(body.value.language)
  if (!language.ok) return badRequest(language.message)

  try {
    const suffix = randomBytes(4).toString('hex')
    const roomName = `bed-${roomId.value}-${suffix}`
    const jobMetadata: AgentJobMetadata = { roomId: roomId.value, language: language.value }
    const metadata = JSON.stringify(jobMetadata)

    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity: `patient-${roomId.value}-${suffix}`,
      name: `Room ${roomId.value}`,
      metadata,
      ttl: '15m',
    })
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })
    // Explicit dispatch: the agent joins this room as soon as the patient connects.
    token.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName: AGENT_NAME, metadata })],
    })

    return json({
      serverUrl: config.url,
      participantToken: await token.toJwt(),
      roomName,
    })
  } catch (error) {
    return serverError(error, 'mint LiveKit token')
  }
}
