import type {
  CallRequest,
  LanguagePreference,
  OptionId,
  RequestAction,
  RequestDraft,
  RequestStatus,
  RouteResponse,
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

const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', body: JSON.stringify(body) })

export const listRequests = async (params: URLSearchParams): Promise<CallRequest[]> =>
  (await request<{ requests: CallRequest[] }>(`/api/requests?${params}`)).requests

export const sendOption = async (roomId: string, optionId: OptionId): Promise<CallRequest> =>
  (await post<{ request: CallRequest }>('/api/requests', { roomId, source: 'tile', optionId }))
    .request

export const callNurse = async (roomId: string): Promise<CallRequest> =>
  (await post<{ request: CallRequest }>('/api/requests', { roomId, source: 'nurse_button' }))
    .request

/** Typed text: comes back as a draft to confirm, or as a request already sent to the nurse. */
export const sendTyped = (
  roomId: string,
  text: string,
  language: LanguagePreference,
): Promise<RouteResponse> => post('/api/route', { roomId, text, language })

export const listDrafts = async (params: URLSearchParams): Promise<RequestDraft[]> =>
  (await request<{ drafts: RequestDraft[] }>(`/api/drafts?${params}`)).drafts

export const confirmDraft = (
  id: string,
): Promise<{ draft: RequestDraft; request: CallRequest | null }> =>
  post(`/api/drafts/${encodeURIComponent(id)}/confirm`, {})

export const discardDraft = async (id: string): Promise<RequestDraft> =>
  (await post<{ draft: RequestDraft }>(`/api/drafts/${encodeURIComponent(id)}/discard`, {})).draft

const patchRequest = async (
  id: string,
  body: { action: RequestAction } | { status: RequestStatus },
): Promise<CallRequest> =>
  (
    await request<{ request: CallRequest }>(`/api/requests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  ).request

export const updateRequest = (id: string, action: RequestAction): Promise<CallRequest> =>
  patchRequest(id, { action })

export const setRequestStatus = (id: string, status: RequestStatus): Promise<CallRequest> =>
  patchRequest(id, { status })

export interface VoiceToken {
  serverUrl: string
  participantToken: string
  roomName: string
}

export const fetchVoiceToken = (
  roomId: string,
  language: LanguagePreference,
): Promise<VoiceToken> => post('/api/livekit/token', { roomId, language })
