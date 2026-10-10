// Client for the web API. The web app is the only writer; the agent never touches the database.
// Every call here never rejects. Error strings carry the status or error kind only: no headers,
// no secret, no transcript.
import type { CallRequest, DraftInput, RequestDraft, RoutedRequestInput } from '@bell/core/taxonomy'

const TIMEOUT_MS = 3000

export interface ApiConfig {
  appUrl: string
  agentSharedSecret: string
}

export type ApiFailure = { ok: false; error: string; status?: number }

/** POST /api/requests: save a routed request right away (the nurse-now path). */
export async function postRoutedRequest(
  input: RoutedRequestInput,
  config: ApiConfig,
): Promise<{ ok: true; requestId: string | undefined } | ApiFailure> {
  const result = await post('/api/requests', input, config)
  if (!result.ok) return result
  const body = await readJson<{ request?: Pick<CallRequest, 'id'> }>(result.response)
  // Saved. The id is only for logs, so an unexpected body doesn't count as a failure.
  return { ok: true, requestId: body?.request?.id }
}

/** POST /api/drafts: create a pending draft the patient still has to confirm. */
export async function createDraft(
  input: DraftInput,
  config: ApiConfig,
): Promise<{ ok: true; draft: RequestDraft } | ApiFailure> {
  const result = await post('/api/drafts', input, config)
  if (!result.ok) return result
  const body = await readJson<{ draft?: RequestDraft }>(result.response)
  // Without the id we couldn't confirm or discard it later.
  if (typeof body?.draft?.id !== 'string') return { ok: false, error: 'response had no draft id' }
  return { ok: true, draft: body.draft }
}

/** POST /api/drafts/{id}/confirm: turns the draft into a request. Idempotent; 409 if discarded. */
export async function confirmDraft(
  draftId: string,
  config: ApiConfig,
): Promise<{ ok: true; requestId: string | undefined } | ApiFailure> {
  const result = await post(`/api/drafts/${encodeURIComponent(draftId)}/confirm`, {}, config)
  if (!result.ok) return result
  const body = await readJson<{ request?: Pick<CallRequest, 'id'> }>(result.response)
  return { ok: true, requestId: body?.request?.id }
}

/** POST /api/drafts/{id}/discard. Idempotent for pending drafts. */
export async function discardDraft(
  draftId: string,
  config: ApiConfig,
): Promise<{ ok: true } | ApiFailure> {
  const result = await post(`/api/drafts/${encodeURIComponent(draftId)}/discard`, {}, config)
  if (!result.ok) return result
  await result.response.body?.cancel()
  return { ok: true }
}

async function post(
  path: string,
  body: unknown,
  config: ApiConfig,
): Promise<{ ok: true; response: Response } | ApiFailure> {
  let response: Response
  try {
    response = await fetch(`${config.appUrl}${path}`, {
      method: 'POST',
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
