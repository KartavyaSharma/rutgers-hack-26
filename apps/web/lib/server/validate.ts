import {
  DRAFT_STATUSES,
  type DraftStatus,
  isLanguagePreference,
  isOptionId,
  isTeam,
  LANGUAGES,
  type LanguagePreference,
  type OptionId,
  REQUEST_ACTIONS,
  REQUEST_STATUSES,
  type RequestAction,
  type RequestStatus,
  ROUTE_REASONS,
  type RouteResult,
  TEAMS,
  type Team,
  URGENCIES,
} from '@bell/core/taxonomy'
import { isRoomId } from '../room-id'
import { fail, ok, type Parsed } from './http'

export const MAX_TEXT_LENGTH = 1000

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: string): boolean => UUID.test(value)

export const parseRoomId = (value: unknown, field = 'roomId'): Parsed<string> =>
  isRoomId(value) ? ok(value) : fail(`${field} must be 1-32 letters, digits, "-" or "_"`)

/** Optional room language setting: "auto" (default when absent) or one of LANGUAGES. */
export const parseLanguage = (value: unknown): Parsed<LanguagePreference> => {
  if (value === undefined || value === null) return ok('auto')
  return isLanguagePreference(value)
    ? ok(value)
    : fail(`language must be "auto" or one of: ${LANGUAGES.map((l) => l.code).join(', ')}`)
}

export const parseText = (value: unknown, field = 'text'): Parsed<string> => {
  if (typeof value !== 'string') return fail(`${field} must be a string`)
  const text = value.trim()
  if (!text) return fail(`${field} must not be empty`)
  if (text.length > MAX_TEXT_LENGTH) {
    return fail(`${field} must be at most ${MAX_TEXT_LENGTH} characters`)
  }
  return ok(text)
}

const parseString = (
  value: unknown,
  field: string,
  { max, allowEmpty = false }: { max: number; allowEmpty?: boolean },
): Parsed<string> => {
  if (typeof value !== 'string') return fail(`${field} must be a string`)
  const text = value.trim()
  if (!text && !allowEmpty) return fail(`${field} must not be empty`)
  if (text.length > max) return fail(`${field} must be at most ${max} characters`)
  return ok(text)
}

/** Validates a routing decision sent by the voice agent. */
export const parseDecision = (value: unknown): Parsed<RouteResult> => {
  if (!isObject(value)) return fail('decision must be an object')
  const { team, urgency, clinical, confidence, reason } = value

  if (!isTeam(team)) return fail(`decision.team must be one of: ${TEAMS.join(', ')}`)
  if (!isOneOf(URGENCIES, urgency)) {
    return fail(`decision.urgency must be one of: ${URGENCIES.join(', ')}`)
  }
  if (typeof clinical !== 'boolean') return fail('decision.clinical must be a boolean')
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return fail('decision.confidence must be a number')
  }
  if (confidence < 0 || confidence > 1) return fail('decision.confidence must be between 0 and 1')
  if (!isOneOf(ROUTE_REASONS, reason)) {
    return fail(`decision.reason must be one of: ${ROUTE_REASONS.join(', ')}`)
  }

  const category = parseString(value.category, 'decision.category', { max: 64 })
  if (!category.ok) return category
  const staffSummary = parseString(value.staffSummary, 'decision.staffSummary', { max: 280 })
  if (!staffSummary.ok) return staffSummary
  const patientReply = parseString(value.patientReply, 'decision.patientReply', {
    max: 500,
    allowEmpty: true,
  })
  if (!patientReply.ok) return patientReply
  const language = parseString(value.language, 'decision.language', { max: 16 })
  if (!language.ok) return language

  return ok({
    team,
    category: category.value,
    urgency,
    clinical,
    confidence,
    staffSummary: staffSummary.value,
    patientReply: patientReply.value,
    language: language.value,
    reason,
  })
}

export type CreateRequestBody =
  | { kind: 'button'; roomId: string; source: 'tile'; optionId: OptionId }
  | { kind: 'button'; roomId: string; source: 'nurse_button' }
  | { kind: 'routed'; roomId: string; source: 'voice'; text: string; decision: RouteResult }

/** Body of POST /api/requests: a tablet button, or a routed request from the voice agent. */
export const parseCreateRequest = (body: Record<string, unknown>): Parsed<CreateRequestBody> => {
  const roomId = parseRoomId(body.roomId)
  if (!roomId.ok) return roomId

  switch (body.source) {
    case 'tile': {
      if (!isOptionId(body.optionId)) return fail('optionId must be a known request option id')
      return ok({ kind: 'button', roomId: roomId.value, source: 'tile', optionId: body.optionId })
    }
    case 'nurse_button':
      return ok({ kind: 'button', roomId: roomId.value, source: 'nurse_button' })
    case 'voice': {
      const text = parseText(body.text)
      if (!text.ok) return text
      const decision = parseDecision(body.decision)
      if (!decision.ok) return decision
      return ok({
        kind: 'routed',
        roomId: roomId.value,
        source: 'voice',
        text: text.value,
        decision: decision.value,
      })
    }
    default:
      return fail('source must be one of: tile, nurse_button, voice')
  }
}

export type StatusFilter = RequestStatus | 'open' | 'all'

export interface ListQuery {
  team?: Team
  roomId?: string
  status: StatusFilter
  limit: number
}

/** Query string of GET /api/requests and GET /api/stream. Empty values are ignored. */
export const parseListQuery = (params: URLSearchParams): Parsed<ListQuery> => {
  const query: ListQuery = { status: 'open', limit: 200 }

  const team = params.get('team')
  if (team) {
    if (!isTeam(team)) return fail(`team must be one of: ${TEAMS.join(', ')}`)
    query.team = team
  }

  const room = params.get('room')
  if (room) {
    const roomId = parseRoomId(room, 'room')
    if (!roomId.ok) return roomId
    query.roomId = roomId.value
  }

  const status = params.get('status')
  if (status) {
    if (status !== 'all' && status !== 'open' && !isOneOf(REQUEST_STATUSES, status)) {
      return fail(`status must be "all", "open" or one of: ${REQUEST_STATUSES.join(', ')}`)
    }
    query.status = status
  }

  const limit = params.get('limit')
  if (limit) {
    const n = Number(limit)
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      return fail('limit must be an integer from 1 to 500')
    }
    query.limit = n
  }

  return ok(query)
}

export const parseAction = (value: unknown): Parsed<RequestAction> =>
  isOneOf(REQUEST_ACTIONS, value)
    ? ok(value)
    : fail(`action must be one of: ${REQUEST_ACTIONS.join(', ')}`)

export const parseStatus = (value: unknown): Parsed<RequestStatus> =>
  isOneOf(REQUEST_STATUSES, value)
    ? ok(value)
    : fail(`status must be one of: ${REQUEST_STATUSES.join(', ')}`)

export interface DraftBody {
  roomId: string
  source: 'voice'
  text: string
  decision: RouteResult
}

/** Body of POST /api/drafts (DraftInput from the voice agent). */
export const parseDraftInput = (body: Record<string, unknown>): Parsed<DraftBody> => {
  const roomId = parseRoomId(body.roomId)
  if (!roomId.ok) return roomId
  if (body.source !== 'voice') return fail('source must be "voice"')
  const text = parseText(body.text)
  if (!text.ok) return text
  const decision = parseDecision(body.decision)
  if (!decision.ok) return decision
  return ok({ roomId: roomId.value, source: 'voice', text: text.value, decision: decision.value })
}

export interface DraftListQuery {
  roomId?: string
  status: DraftStatus | 'all'
  limit: number
}

/** Query string of GET /api/drafts: room, status (default pending, or "all"), limit. */
export const parseDraftQuery = (params: URLSearchParams): Parsed<DraftListQuery> => {
  const query: DraftListQuery = { status: 'pending', limit: 50 }

  const room = params.get('room')
  if (room) {
    const roomId = parseRoomId(room, 'room')
    if (!roomId.ok) return roomId
    query.roomId = roomId.value
  }

  const status = params.get('status')
  if (status) {
    if (status !== 'all' && !isOneOf(DRAFT_STATUSES, status)) {
      return fail(`status must be "all" or one of: ${DRAFT_STATUSES.join(', ')}`)
    }
    query.status = status
  }

  const limit = params.get('limit')
  if (limit) {
    const n = Number(limit)
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      return fail('limit must be an integer from 1 to 200')
    }
    query.limit = n
  }

  return ok(query)
}
