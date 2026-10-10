// The real Cerebras layer (@effect/ai-openai-compat client + FetchHttpClient) against a fake
// fetch: checks what goes over the wire and how HTTP failures are mapped. No network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CEREBRAS_BASE_URL, DEFAULT_CEREBRAS_MODEL, routeText, TEAMS } from '../src'
import { decision } from './helpers'

interface SeenRequest {
  readonly url: string
  readonly method: string | undefined
  readonly headers: Headers
  // biome-ignore lint/suspicious/noExplicitAny: inspecting an arbitrary JSON request body
  readonly body: any
  readonly signal: AbortSignal | null | undefined
}

const fakeFetch = (respond: (request: SeenRequest) => Response | Promise<Response>) => {
  const requests: Array<SeenRequest> = []
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const raw =
      init?.body === undefined || init.body === null ? '' : await new Response(init.body).text()
    const request: SeenRequest = {
      url,
      method: init?.method,
      headers: new Headers(init?.headers),
      body: raw.length > 0 ? JSON.parse(raw) : undefined,
      signal: init?.signal,
    }
    requests.push(request)
    return respond(request)
  })
  return { fetch: fetch as typeof globalThis.fetch, spy: fetch, requests }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const completion = (content: string) =>
  json(200, {
    id: 'chatcmpl-test',
    model: DEFAULT_CEREBRAS_MODEL,
    created: 1_760_000_000,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 300, completion_tokens: 60, total_tokens: 360 },
  })

const TEXT = 'the TV remote is broken'
const ANSWER = decision({ team: 'facilities', category: 'tv_remote' })

beforeEach(() => {
  vi.stubEnv('CEREBRAS_API_KEY', '')
  vi.stubEnv('CEREBRAS_MODEL', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Cerebras request', () => {
  it('posts a strict JSON-schema chat completion with reasoning_effort "none"', async () => {
    const { fetch, requests } = fakeFetch(() => completion(JSON.stringify(ANSWER)))
    const result = await routeText(TEXT, { apiKey: 'test-key', fetch })

    expect(result).toMatchObject({ team: 'facilities', category: 'tv_remote', reason: 'model' })
    expect(requests).toHaveLength(1)
    const [request] = requests
    if (request === undefined) throw new Error('no request')

    expect(request.url).toBe(`${CEREBRAS_BASE_URL}/chat/completions`)
    expect(request.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe('Bearer test-key')

    const { body } = request
    expect(body.model).toBe(DEFAULT_CEREBRAS_MODEL)
    expect(body.reasoning_effort).toBe('none')
    expect(body.temperature).toBe(0)
    expect(body.max_tokens).toBe(400)
    expect(body).not.toHaveProperty('reasoning')
    expect(body).not.toHaveProperty('stream')

    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user'])
    expect(body.messages[1].content).toContain(TEXT)

    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.name).toBe('routing_decision')
    expect(body.response_format.json_schema.strict).toBe(true)
    const schema = body.response_format.json_schema.schema
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect([...schema.required].sort()).toEqual(
      [
        'category',
        'clinical',
        'confidence',
        'language',
        'patientReply',
        'staffSummary',
        'team',
        'urgency',
      ].sort(),
    )
    expect(schema.properties.team).toEqual({ type: 'string', enum: [...TEAMS] })
    expect(schema.properties.confidence).toEqual({ type: 'number' })
    expect(schema.properties.clinical).toEqual({ type: 'boolean' })
    expect(schema.properties.patientReply.type).toBe('string')
    expect(schema.properties.patientReply.description).toContain('read-back')
    // Only the simple subset Cerebras strict mode supports.
    const serialized = JSON.stringify(schema)
    for (const keyword of ['anyOf', 'minimum', 'maximum', 'pattern', 'format', '$ref']) {
      expect(serialized).not.toContain(`"${keyword}"`)
    }
  })

  it('reads the key and model from the environment', async () => {
    vi.stubEnv('CEREBRAS_API_KEY', 'env-key')
    vi.stubEnv('CEREBRAS_MODEL', 'some-other-model')
    const { fetch, requests } = fakeFetch(() => completion(JSON.stringify(ANSWER)))
    await routeText(TEXT, { fetch })
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer env-key')
    expect(requests[0]?.body.model).toBe('some-other-model')
  })

  it('options win over the environment', async () => {
    vi.stubEnv('CEREBRAS_API_KEY', 'env-key')
    vi.stubEnv('CEREBRAS_MODEL', 'env-model')
    const { fetch, requests } = fakeFetch(() => completion(JSON.stringify(ANSWER)))
    await routeText(TEXT, { fetch, apiKey: 'option-key', model: 'option-model' })
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer option-key')
    expect(requests[0]?.body.model).toBe('option-model')
  })

  it('red flags never reach the network', async () => {
    const { fetch, spy } = fakeFetch(() => completion(JSON.stringify(ANSWER)))
    const result = await routeText('I have chest pain', { apiKey: 'test-key', fetch })
    expect(result.reason).toBe('red_flag')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('Cerebras failures', () => {
  it.each([
    [
      '429 rate limit',
      () => json(429, { error: { message: 'Too many requests', type: 'too_many_requests_error' } }),
      'rate_limited',
    ],
    [
      '429 quota',
      () => json(429, { error: { message: 'Quota exceeded', code: 'insufficient_quota' } }),
      'rate_limited',
    ],
    [
      '500 server error',
      () => json(500, { error: { message: 'Internal error', type: 'server_error' } }),
      'error',
    ],
    [
      '401 bad key',
      () => json(401, { error: { message: 'Wrong API Key', type: 'invalid_request_error' } }),
      'error',
    ],
    [
      '400 bad request',
      () => json(400, { error: { message: 'Unsupported schema', type: 'invalid_request_error' } }),
      'error',
    ],
    [
      'HTML instead of JSON',
      () => new Response('<html>Bad gateway</html>', { status: 200 }),
      'invalid_output',
    ],
    ['model content is not JSON', () => completion('I think housekeeping.'), 'invalid_output'],
    [
      'model content fails the schema',
      () => completion(JSON.stringify({ ...ANSWER, urgency: 'whenever' })),
      'invalid_output',
    ],
    [
      'network error',
      () => {
        throw new TypeError('fetch failed')
      },
      'error',
    ],
  ] as const)('%s', async (_name, respond, reason) => {
    const { fetch } = fakeFetch(respond)
    const result = await routeText(TEXT, { apiKey: 'test-key', fetch })
    expect(result).toMatchObject({ team: 'nurse', reason, category: 'unrouted' })
  })

  it('times out and aborts the HTTP request', async () => {
    let signal: AbortSignal | null | undefined
    const { fetch } = fakeFetch(
      (request) =>
        new Promise<Response>((_resolve, reject) => {
          signal = request.signal
          request.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const started = Date.now()
    const result = await routeText(TEXT, { apiKey: 'test-key', fetch, timeoutMs: 50 })
    expect(result).toMatchObject({ team: 'nurse', reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(1000)
    expect(signal?.aborted).toBe(true)
  })
})
