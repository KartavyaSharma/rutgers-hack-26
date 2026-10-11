import type {
  CallRequest,
  OptionId,
  RequestAction,
  RequestStatus,
  VoiceTokenInput,
} from '@bell/core/taxonomy'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const info = (body ?? {}) as { error?: string; message?: string }
    throw new ApiError(res.status, info.error ?? 'error', info.message ?? `HTTP ${res.status}`)
  }
  return body as T
}

const send = <T>(url: string, method: 'POST' | 'PATCH', body: unknown) =>
  request<T>(url, { method, body: JSON.stringify(body) })

export const listRequests = async (params: URLSearchParams): Promise<CallRequest[]> =>
  (await request<{ requests: CallRequest[] }>(`/api/requests?${params}`)).requests

/** "I have an emergency": an urgent nurse call. */
export const callForHelp = async (roomId: string): Promise<CallRequest> =>
  (
    await send<{ request: CallRequest }>('/api/requests', 'POST', {
      roomId,
      source: 'nurse_button',
    })
  ).request

/** A category option on the tablet: a fixed destination, no AI. */
export const sendOption = async (roomId: string, optionId: OptionId): Promise<CallRequest> =>
  (
    await send<{ request: CallRequest }>('/api/requests', 'POST', {
      roomId,
      source: 'tile',
      optionId,
    })
  ).request

const patchRequest = async (
  id: string,
  body: { action: RequestAction } | { status: RequestStatus },
): Promise<CallRequest> =>
  (await send<{ request: CallRequest }>(`/api/requests/${encodeURIComponent(id)}`, 'PATCH', body))
    .request

/** Patient actions: 'cancel' (also "I pressed this by mistake") and 'nudge' ("Still waiting?"). */
export const requestAction = (id: string, action: 'cancel' | 'nudge'): Promise<CallRequest> =>
  patchRequest(id, { action })

/** "Resolved by staff" on the emergency screen: the nurse at the bedside closes the call. */
export const resolveRequest = (id: string): Promise<CallRequest> =>
  patchRequest(id, { action: 'done' })

/** Staff dev view: set a status directly. */
export const setRequestStatus = (id: string, status: RequestStatus): Promise<CallRequest> =>
  patchRequest(id, { status })

export interface VoiceToken {
  serverUrl: string
  participantToken: string
  roomName: string
}

export const fetchVoiceToken = (input: VoiceTokenInput): Promise<VoiceToken> =>
  send('/api/livekit/token', 'POST', input)
