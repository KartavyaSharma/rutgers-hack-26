import { randomBytes } from 'node:crypto'
import { AGENT_NAME, type AgentJobMetadata, isOpenStatus } from '@bell/core/taxonomy'
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk'
import type { NextRequest } from 'next/server'
import { liveKitConfig } from '@/lib/server/env'
import { badRequest, json, notFound, readJsonObject, serverError } from '@/lib/server/http'
import { getRequest } from '@/lib/server/requests'
import { parseVoiceTokenInput } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/livekit/token VoiceTokenInput { roomId, language?, mode?, emergencyRequestId? }
 * -> { serverUrl, participantToken, roomName }: a patient token for a fresh LiveKit room with the
 * agent dispatched, carrying AgentJobMetadata.
 * mode 'emergency' needs emergencyRequestId: an open nurse request in the same room (404 if it
 * doesn't exist there, 409 if it isn't an open nurse request). 503 when voice isn't configured.
 */
export async function POST(request: NextRequest) {
  const config = liveKitConfig()
  if (!config) return json({ error: 'voice_not_configured' }, 503)

  const body = await readJsonObject(request)
  if (!body.ok) return badRequest(body.message)
  const input = parseVoiceTokenInput(body.value)
  if (!input.ok) return badRequest(input.message)
  const { roomId, language, mode, emergencyRequestId } = input.value

  try {
    if (emergencyRequestId !== null) {
      const emergency = await getRequest(emergencyRequestId)
      // Another room's request is reported as missing, so ids can't be probed across rooms.
      if (!emergency || emergency.roomId !== roomId) {
        return notFound('Emergency request not found in this room')
      }
      if (emergency.team !== 'nurse' || !isOpenStatus(emergency.status)) {
        return json(
          {
            error: 'conflict',
            message: 'The emergency request must be an open nurse request',
            request: emergency,
          },
          409,
        )
      }
    }

    const suffix = randomBytes(4).toString('hex')
    const roomName = `bed-${roomId}-${suffix}`
    const jobMetadata: AgentJobMetadata = { roomId, language, mode, emergencyRequestId }
    const metadata = JSON.stringify(jobMetadata)

    const token = new AccessToken(config.apiKey, config.apiSecret, {
      identity: `patient-${roomId}-${suffix}`,
      name: `Room ${roomId}`,
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
