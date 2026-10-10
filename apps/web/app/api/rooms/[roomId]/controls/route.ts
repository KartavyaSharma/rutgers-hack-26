import type { RoomControlsState } from '@bell/core/adapters'
import type { NextRequest } from 'next/server'
import { badRequest, json, readJsonObject, serverError } from '@/lib/server/http'
import { roomControls } from '@/lib/server/room-controls'
import { parseRoomControlsPatch, parseRoomId } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/rooms/[roomId]/controls -> RoomControlsState */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/rooms/[roomId]/controls'>,
) {
  const { roomId } = await ctx.params
  const room = parseRoomId(roomId, 'roomId')
  if (!room.ok) return badRequest(room.message)
  try {
    return json(await roomControls().getState(room.value))
  } catch (error) {
    return serverError(error, 'read room controls')
  }
}

/**
 * PATCH /api/rooms/[roomId]/controls { lights?, temperatureF?, blinds?, tv? } -> RoomControlsState
 * Applies each field that is present; the room clamps values to its own ranges.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/rooms/[roomId]/controls'>,
) {
  const { roomId } = await ctx.params
  const room = parseRoomId(roomId, 'roomId')
  if (!room.ok) return badRequest(room.message)
  const body = await readJsonObject(request)
  if (!body.ok) return badRequest(body.message)
  const patch = parseRoomControlsPatch(body.value)
  if (!patch.ok) return badRequest(patch.message)

  try {
    const controls = roomControls()
    const { lights, temperatureF, blinds, tv } = patch.value
    let state: RoomControlsState = await controls.getState(room.value)
    if (lights !== undefined) state = await controls.setLights(room.value, lights)
    if (temperatureF !== undefined) state = await controls.setTemperature(room.value, temperatureF)
    if (blinds !== undefined) state = await controls.setBlinds(room.value, blinds)
    if (tv !== undefined) state = await controls.setTv(room.value, tv)
    return json(state)
  } catch (error) {
    return serverError(error, 'update room controls')
  }
}
