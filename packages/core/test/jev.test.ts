// classifyRequest() over the real Jev client (Effect HttpClient + FetchHttpClient) with a fake
// fetch, plus a few runs against a mock Jev service. No network.
import { it as effectIt } from '@effect/vitest'
import { Effect, Fiber, Layer } from 'effect'
import { TestClock } from 'effect/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLINICAL_THRESHOLD,
  classifyRequest,
  classifyRequestEffect,
  DEFAULT_JEV_MODEL,
  type GroupId,
  groupOfCategory,
  IMMEDIATE_BY_REASON,
  Jev,
  type JevAnswers,
  makeClassifyRequest,
  NURSE_BUTTON,
  NURSE_CLINICAL_THRESHOLD,
  needsNurseNow,
  REQUEST_GROUPS,
  ROUTER_TIMEOUT_MS,
  RouterRateLimited,
  TEAMS,
  type Team,
  URGENCIES,
  type Urgency,
} from '../src'
import { expectWellFormed } from './helpers'

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
  const spy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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
  return { fetch: spy as typeof globalThis.fetch, spy, requests }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

interface Answer {
  readonly team: Team
  readonly confidence?: number
  readonly clinical?: number
  readonly urgency?: Urgency
  readonly group?: GroupId
}

/** A plausible request group per team, so most tests don't have to pick one. */
const DEFAULT_GROUP: Record<Team, GroupId> = {
  nurse: 'ask_care_team',
  care_aide: 'comfort',
  housekeeping: 'cleaning',
  facilities: 'fix_something',
  food: 'water_food',
  it: 'fix_something',
}

const GROUP_IDS: ReadonlyArray<GroupId> = REQUEST_GROUPS.map((g) => g.id)

/** A Jev response body as the API returns it. */
const jevBody = ({
  team,
  confidence = 0.95,
  clinical = 0.05,
  urgency = 'routine',
  group = DEFAULT_GROUP[team],
}: Answer) => {
  const spread = <L extends string>(labels: ReadonlyArray<L>, chosen: L, p: number) =>
    Object.fromEntries(
      labels.map((label) => [label, label === chosen ? p : (1 - p) / (labels.length - 1)]),
    )
  return {
    model: 'jev-1.13.0',
    answers: {
      team: {
        type: 'choice',
        choice: team,
        probabilities: spread(TEAMS, team, confidence),
        confidence,
      },
      clinical: { type: 'noul', noul: clinical },
      urgency: {
        type: 'choice',
        choice: urgency,
        probabilities: spread(URGENCIES, urgency, 0.9),
        confidence: 0.9,
      },
      group: {
        type: 'choice',
        choice: group,
        probabilities: spread(GROUP_IDS, group, 0.85),
        confidence: 0.85,
      },
    },
    usage: { input_tokens: 180, output_tokens: 3 },
  }
}

const jev = (answer: Answer) => fakeFetch(() => json(200, jevBody(answer)))

const KEY = { apiKey: 'test-key' }
const QUOTE = (text: string) => `“${text}”`

beforeEach(() => {
  vi.stubEnv('TYPESAFE_API_KEY', '')
  vi.stubEnv('TYPESAFE_MODEL', '')
  vi.stubEnv('TYPESAFE_API_BASE', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Jev request', () => {
  it('posts the text with the three questions', async () => {
    const { fetch, requests } = jev({ team: 'care_aide' })
    await classifyRequest({ text: 'can I get another blanket' }, { ...KEY, fetch })

    expect(requests).toHaveLength(1)
    const [request] = requests
    if (request === undefined) throw new Error('no request')
    expect(request.url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(request.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe('Bearer test-key')
    expect(request.headers.get('content-type')).toContain('application/json')

    const { body } = request
    expect(body.model).toBe(DEFAULT_JEV_MODEL)
    expect(body.state).toBe('can I get another blanket')
    expect(Object.keys(body.questions)).toEqual(['team', 'clinical', 'urgency', 'group'])

    expect(body.questions.team.type).toBe('choice')
    expect(Object.keys(body.questions.team.criteria)).toEqual([...TEAMS])
    expect(body.questions.urgency.type).toBe('choice')
    expect(Object.keys(body.questions.urgency.criteria)).toEqual([...URGENCIES])
    expect(body.questions.clinical.type).toBe('noul')
    expect(body.questions.group.type).toBe('choice')
    expect(Object.keys(body.questions.group.criteria)).toEqual([...GROUP_IDS])
    for (const question of Object.values(body.questions) as Array<{
      instructions: string
      criteria?: Record<string, string>
    }>) {
      expect(question.instructions.length).toBeGreaterThan(0)
      for (const description of Object.values(question.criteria ?? {})) {
        expect(description.length).toBeLessThanOrEqual(255)
      }
    }
  })

  it('reads key, model and base URL from the environment', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'env-key')
    vi.stubEnv('TYPESAFE_MODEL', 'jev-1.13.0')
    vi.stubEnv('TYPESAFE_API_BASE', 'https://jev.example.test/v1/')
    const { fetch, requests } = jev({ team: 'it' })
    await classifyRequest({ text: 'the wifi is down' }, { fetch })
    expect(requests[0]?.url).toBe('https://jev.example.test/v1/systemone')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer env-key')
    expect(requests[0]?.body.model).toBe('jev-1.13.0')
  })

  it('options win over the environment', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'env-key')
    const { fetch, requests } = jev({ team: 'it' })
    await classifyRequest(
      { text: 'the wifi is down' },
      { fetch, apiKey: 'option-key', model: 'jev-x', baseUrl: 'https://other.test' },
    )
    expect(requests[0]?.url).toBe('https://other.test/v1/systemone')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer option-key')
    expect(requests[0]?.body.model).toBe('jev-x')
  })
})

describe('Jev routing', () => {
  it.each([
    ['can I get another blanket', 'care_aide', 'routine', 'comfort'],
    ['the TV remote is broken', 'facilities', 'routine', 'fix_something'],
    ["there's a spill by the sink", 'housekeeping', 'soon', 'cleaning'],
    ['my lunch tray never came', 'food', 'soon', 'water_food'],
    ["the wifi isn't working on my laptop", 'it', 'routine', 'fix_something'],
    ['when will the doctor come by', 'nurse', 'routine', 'ask_care_team'],
    ['could you help me sit up', 'care_aide', 'soon', 'reposition'],
  ] as const)('%j -> %s, group %s', async (text, team, urgency, group) => {
    const { fetch } = jev({ team, urgency, group, confidence: 0.93 })
    const result = await classifyRequest({ text }, { ...KEY, fetch })
    expect(groupOfCategory(result.category)).toBe(group)
    expect(result).toMatchObject({
      team,
      category: group,
      urgency,
      clinical: false,
      confidence: 0.93,
      reason: 'model',
      language: 'en',
      patientReply: QUOTE(text),
      staffSummary: `Patient request: "${text}"`,
    })
    expect(needsNurseNow(result)).toBe(false)
    expectWellFormed(result)
  })

  it('uses the caller read-back, staff summary and category', async () => {
    const { fetch } = jev({ team: 'care_aide' })
    const result = await classifyRequest(
      {
        text: 'um could I maybe get like another blanket',
        readBack: 'An extra blanket.',
        staffSummary: 'Patient requests another blanket',
        category: 'Blanket Request',
      },
      { ...KEY, fetch },
    )
    expect(result).toMatchObject({
      team: 'care_aide',
      category: 'blanket_request',
      patientReply: 'An extra blanket.',
      staffSummary: 'Patient requests another blanket',
      reason: 'model',
    })
    expectWellFormed(result)
  })

  it('ignores a caller read-back that names a team or says it was sent', async () => {
    const { fetch } = jev({ team: 'housekeeping' })
    const text = 'there is water all over the floor'
    const result = await classifyRequest(
      { text, readBack: "I've sent housekeeping to clean the spill." },
      { ...KEY, fetch },
    )
    expect(result.patientReply).toBe(QUOTE(text))
    expectWellFormed(result)
  })

  it('Spanish text: language detected, Spanish quote', async () => {
    const { fetch } = jev({ team: 'care_aide' })
    const result = await classifyRequest(
      { text: 'necesito otra almohada', readBack: 'Una almohada más.' },
      { ...KEY, fetch },
    )
    expect(result).toMatchObject({
      team: 'care_aide',
      language: 'es',
      patientReply: 'Una almohada más.',
      staffSummary: 'Patient request (es): "necesito otra almohada"',
    })
    expectWellFormed(result)
  })

  it('room language setting wins over detection', async () => {
    const { fetch } = jev({ team: 'it', clinical: 0.9 })
    const result = await classifyRequest(
      { text: 'my laptop charger hurts my hand', language: 'es' },
      { ...KEY, fetch },
    )
    expect(result).toMatchObject({ reason: 'clinical', language: 'es' })
    expect(result.patientReply).toBe('Tu enfermera ya viene.')
  })

  it('red flags never call Jev', async () => {
    const { fetch, spy } = jev({ team: 'care_aide' })
    const result = await classifyRequest(
      { text: 'me duele el pecho', readBack: 'Dolor de pecho.' },
      { ...KEY, fetch },
    )
    expect(spy).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      team: 'nurse',
      urgency: 'urgent',
      clinical: true,
      reason: 'red_flag',
      category: NURSE_BUTTON.category,
      language: 'es',
      patientReply: 'Tu enfermera ya viene.',
    })
    expect(needsNurseNow(result)).toBe(true)
    expectWellFormed(result)
  })

  it('clinical by score: any team goes to the nurse right away, urgent', async () => {
    const { fetch } = jev({ team: 'care_aide', clinical: 0.72, urgency: 'routine' })
    const result = await classifyRequest(
      { text: 'I feel dizzy, can I get some water', readBack: 'Some water.' },
      { ...KEY, fetch },
    )
    expect(result).toMatchObject({
      team: 'nurse',
      category: 'comfort',
      urgency: 'urgent',
      clinical: true,
      reason: 'clinical',
      patientReply: 'Your nurse is on the way.',
    })
    expect(needsNurseNow(result)).toBe(true)
    expectWellFormed(result)
  })

  it.each([
    ['exactly at CLINICAL_THRESHOLD', 'care_aide', CLINICAL_THRESHOLD, 'clinical'],
    ['just under CLINICAL_THRESHOLD', 'care_aide', CLINICAL_THRESHOLD - 0.01, 'model'],
    ['nurse at NURSE_CLINICAL_THRESHOLD', 'nurse', NURSE_CLINICAL_THRESHOLD, 'clinical'],
    [
      'nurse just under NURSE_CLINICAL_THRESHOLD',
      'nurse',
      NURSE_CLINICAL_THRESHOLD - 0.01,
      'model',
    ],
  ] as const)('%s', async (_name, team, clinical, reason) => {
    const { fetch } = jev({ team, clinical })
    const result = await classifyRequest({ text: 'a question' }, { ...KEY, fetch })
    expect(result.reason).toBe(reason)
    expect(needsNurseNow(result)).toBe(reason === 'clinical')
    expectWellFormed(result)
  })

  it('low confidence: to the nurse, category keeps Jev’s group', async () => {
    const { fetch } = jev({ team: 'facilities', confidence: 0.55, urgency: 'soon' })
    const text = 'the thing is doing the thing again'
    const result = await classifyRequest({ text }, { ...KEY, fetch })
    expect(result).toMatchObject({
      team: 'nurse',
      category: 'fix_something',
      urgency: 'soon',
      confidence: 0.55,
      reason: 'low_confidence',
      patientReply: QUOTE(text),
    })
    expect(needsNurseNow(result)).toBe(false)
    expectWellFormed(result)
  })
})

describe('Jev failures', () => {
  const text = 'can I get another blanket'

  it.each([
    ['429 rate limit', () => json(429, { error: 'rate limited' }), 'rate_limited'],
    ['529 overloaded', () => json(529, { error: 'overloaded' }), 'rate_limited'],
    ['401 bad key', () => json(401, { error: 'invalid api key' }), 'error'],
    ['422 validation', () => json(422, { detail: [{ loc: ['body', 'state'] }] }), 'error'],
    ['500 server error', () => json(500, { error: 'boom' }), 'error'],
    ['malformed JSON', () => new Response('{"model": "jev', { status: 200 }), 'invalid_output'],
    ['HTML body', () => new Response('<html>oops</html>', { status: 200 }), 'invalid_output'],
    [
      'unknown team',
      () =>
        json(200, {
          ...jevBody({ team: 'care_aide' }),
          answers: {
            team: { type: 'choice', choice: 'doctor', probabilities: {}, confidence: 0.9 },
          },
        }),
      'invalid_output',
    ],
    [
      'missing clinical answer',
      () => {
        const body = jevBody({ team: 'care_aide' })
        return json(200, {
          ...body,
          answers: { team: body.answers.team, urgency: body.answers.urgency },
        })
      },
      'invalid_output',
    ],
    [
      'unknown group',
      () => json(200, jevBody({ team: 'care_aide', group: 'gift_shop' as GroupId })),
      'invalid_output',
    ],
    [
      'noul out of range',
      () => json(200, jevBody({ team: 'care_aide', clinical: 1.5 })),
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
    const result = await classifyRequest({ text, readBack: 'An extra blanket.' }, { ...KEY, fetch })
    expect(result).toMatchObject({ team: 'nurse', reason, category: NURSE_BUTTON.category })
    // These all go to the nurse right away, so the patient is told so.
    expect(IMMEDIATE_BY_REASON[reason]).toBe(true)
    expect(result.patientReply).toBe('Your nurse is on the way.')
    expectWellFormed(result)
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
    const result = await classifyRequest({ text }, { ...KEY, fetch, timeoutMs: 50 })
    expect(result).toMatchObject({ team: 'nurse', reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(1000)
    expect(signal?.aborted).toBe(true)
    expectWellFormed(result)
  })

  it('missing key: no network, nurse decision with the caller read-back', async () => {
    const { fetch, spy } = jev({ team: 'care_aide' })
    const result = await classifyRequest({ text, readBack: 'An extra blanket.' }, { fetch })
    expect(spy).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      team: 'nurse',
      reason: 'not_configured',
      category: NURSE_BUTTON.category,
      patientReply: 'An extra blanket.',
    })
    expect(needsNurseNow(result)).toBe(false)
    expectWellFormed(result)
  })

  it('missing key without a read-back quotes the patient', async () => {
    const result = await classifyRequest({ text })
    expect(result).toMatchObject({ reason: 'not_configured', patientReply: QUOTE(text) })
  })

  it.each(['', '   ', '\n'])('empty input %j: no Jev call, ask again', async (empty) => {
    const { fetch, spy } = jev({ team: 'care_aide' })
    const result = await classifyRequest({ text: empty, readBack: 'Something.' }, { ...KEY, fetch })
    expect(spy).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      team: 'nurse',
      reason: 'empty_input',
      patientReply: 'Okay. What do you need?',
    })
    expectWellFormed(result)
  })

  it('never rejects, whatever it is given', async () => {
    const { fetch } = jev({ team: 'care_aide' })
    const inputs: ReadonlyArray<unknown> = [
      undefined,
      null,
      42,
      {},
      { text: 42 },
      { text: 'ok', staffSummary: 5, readBack: {}, category: [] },
    ]
    for (const input of inputs) {
      await expect(classifyRequest(input as never, { ...KEY, fetch })).resolves.toMatchObject({
        team: expect.any(String),
      })
    }
    const throwing = fakeFetch(() => {
      throw new Error('sync throw')
    })
    await expect(
      classifyRequest({ text }, { ...KEY, fetch: throwing.fetch }),
    ).resolves.toMatchObject({ team: 'nurse', reason: 'error' })
  })
})

describe('makeClassifyRequest with a mock Jev service', () => {
  const answers = (overrides: Partial<JevAnswers> = {}): JevAnswers => ({
    model: 'jev-test',
    team: 'food',
    teamConfidence: 0.9,
    group: 'water_food',
    clinical: 0.1,
    urgency: 'soon',
    ...overrides,
  })

  it('routes with the injected layer', async () => {
    const layer = Layer.succeed(Jev, Jev.of({ classify: () => Effect.succeed(answers()) }))
    const result = await makeClassifyRequest(layer)({ text: 'my tray is missing' })
    expect(result).toMatchObject({ team: 'food', reason: 'model', urgency: 'soon' })
  })

  it('maps service failures and defects', async () => {
    const limited = Layer.succeed(
      Jev,
      Jev.of({ classify: () => Effect.fail(new RouterRateLimited({ message: '429' })) }),
    )
    expect(await makeClassifyRequest(limited)({ text: 'my tray' })).toMatchObject({
      reason: 'rate_limited',
    })
    const dying = Layer.succeed(Jev, Jev.of({ classify: () => Effect.die(new Error('boom')) }))
    expect(await makeClassifyRequest(dying)({ text: 'my tray' })).toMatchObject({
      reason: 'error',
    })
  })

  effectIt.effect('times out after ROUTER_TIMEOUT_MS of virtual time', () =>
    Effect.gen(function* () {
      const slow = Layer.succeed(
        Jev,
        Jev.of({ classify: () => Effect.sleep('10 seconds').pipe(Effect.as(answers())) }),
      )
      const fiber = yield* Effect.forkChild(classifyRequestEffect({ text: 'my tray' }, slow))
      yield* TestClock.adjust(ROUTER_TIMEOUT_MS)
      const result = yield* Fiber.join(fiber)
      expect(result).toMatchObject({ team: 'nurse', reason: 'timeout' })
    }),
  )
})
