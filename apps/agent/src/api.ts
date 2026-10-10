// Client for the web API. The web app is the only writer; the agent never touches the database.
// Every call here never rejects. Error strings carry the status or error kind only: no headers,
// no secret, no transcript.
import type { CallRequest, RequestAction, RoutedRequestInput } from '@bell/core/taxonomy'

const TIMEOUT_MS = 3000

export interface ApiConfig {
  appUrl: string
  agentSharedSecret: string
}

export type ApiFailure = { ok: false; error: string; status?: number }

/** POST /api/requests: save a routed request; it is sent right away (there is no confirm step). */
export async function postRoutedRequest(
  input: RoutedRequestInput,
  config: ApiConfig,
): Promise<{ ok: true; requestId: string | undefined } | ApiFailure> {
  const result = await send('POST', '/api/requests', input, config)
  if (!result.ok) return result
  const body = await readJson<{ request?: Pick<CallRequest, 'id'> }>(result.response)
  // Saved. Without an id it just can't be cancelled by voice later.
  return { ok: true, requestId: body?.request?.id }
}

/** PATCH /api/requests/{id} `{ action: 'cancel' }`. */
export function cancelRequest(
  requestId: string,
  config: ApiConfig,
): Promise<{ ok: true } | ApiFailure> {
  return patchRequest(requestId, { action: 'cancel' }, config)
}

/** PATCH /api/requests/{id} `{ action: 'add_note', text }`: appends to the request's notes. */
export function addRequestNote(
  requestId: string,
  text: string,
  config: ApiConfig,
): Promise<{ ok: true } | ApiFailure> {
  return patchRequest(requestId, { action: 'add_note', text }, config)
}

async function patchRequest(
  requestId: string,
  body: { action: RequestAction; text?: string },
  config: ApiConfig,
): Promise<{ ok: true } | ApiFailure> {
  const result = await send('PATCH', `/api/requests/${encodeURIComponent(requestId)}`, body, config)
  if (!result.ok) return result
  await result.response.body?.cancel()
  return { ok: true }
}

async function send(
  method: 'POST' | 'PATCH',
  path: string,
  body: unknown,
  config: ApiConfig,
): Promise<{ ok: true; response: Response } | ApiFailure> {
  let response: Response
  try {
    response = await fetch(`${config.appUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.agentSharedSecret}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    return { ok: false, error: describeFetchError(error) }
  }
  if (!response.ok) {
    await response.body?.cancel()
    return { ok: false, error: `HTTP ${response.status}`, status: response.status }
  }
  return { ok: true, response }
}

async function readJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T
  } catch {
    return undefined
  }
}

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error'
  if (error.name === 'TimeoutError') return `timed out after ${TIMEOUT_MS} ms`
  // undici puts the network reason (ECONNREFUSED, ENOTFOUND, ...) on `cause`
  const code = (error.cause as { code?: unknown } | undefined)?.code
  return typeof code === 'string' ? `${error.message} (${code})` : error.message
}
