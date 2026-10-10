import { it as effectIt } from '@effect/vitest'
import { Effect, Fiber, Layer } from 'effect'
import { AiError, LanguageModel } from 'effect/ai'
import { TestClock } from 'effect/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IMMEDIATE_BY_REASON,
  makeRouteText,
  needsNurseNow,
  quotePatientWords,
  ROUTE_REASONS,
  ROUTER_TIMEOUT_MS,
  type RouteReason,
  type RouteResult,
  RouterNotConfigured,
  type RoutingDecision,
  routeText,
  routeTextEffect,
} from '../src'
import { aiError, decision, expectWellFormed, mockModel, scriptedModel } from './helpers'

const NURSE_NOTIFIED_EN = 'Your nurse is on the way.'
const NURSE_NOTIFIED_ES = 'Tu enfermera ya viene.'
const ASK_AGAIN_EN = 'Okay. What do you need?'

beforeEach(() => {
  // Tests never use a real key, even if one is exported in the developer's shell.
  vi.stubEnv('CEREBRAS_API_KEY', '')
  vi.stubEnv('CEREBRAS_MODEL', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('model routing (mocked LLM)', () => {
  const routed: ReadonlyArray<readonly [string, RoutingDecision]> = [
    ['can I get another blanket', decision({ team: 'care_aide', category: 'blanket' })],
    [
      'could someone help me to the bathroom',
      decision({
        team: 'care_aide',
        category: 'bathroom_help',
        urgency: 'soon',
        patientReply: 'Help getting to the bathroom.',
      }),
    ],
    [
      'the TV remote is broken',
      decision({
        team: 'facilities',
        category: 'tv_remote',
        staffSummary: 'TV remote is broken',
        patientReply: 'The TV remote is not working.',
      }),
    ],
    [
      "it's freezing in here, can you turn the heat up",
      decision({
        team: 'facilities',
        category: 'room_temperature',
        patientReply: 'A warmer room.',
      }),
    ],
    [
      "my room needs cleaning, there's a spill",
      decision({
        team: 'housekeeping',
        category: 'spill',
        urgency: 'soon',
        patientReply: 'A spill to clean up.',
      }),
    ],
    [
      'the trash can is overflowing',
      decision({ team: 'housekeeping', category: 'trash', patientReply: 'The trash emptied.' }),
    ],
    [
      'my lunch tray never came',
      decision({
        team: 'food',
        category: 'late_meal',
        urgency: 'soon',
        patientReply: 'Your lunch tray.',
      }),
    ],
    [
      "I'm vegetarian and got meat",
      decision({ team: 'food', category: 'wrong_meal', patientReply: 'A vegetarian meal.' }),
    ],
    [
      'can I see the dinner menu',
      decision({ team: 'food', category: 'menu', patientReply: 'The dinner menu.' }),
    ],
    [
      "the wifi isn't working on my laptop",
      decision({ team: 'it', category: 'wifi', patientReply: 'Wi-Fi for your laptop.' }),
    ],
    [
      'this tablet keeps freezing',
      decision({ team: 'it', category: 'tablet', patientReply: 'This tablet keeps freezing.' }),
    ],
  ]
  const { layer, calls } = scriptedModel(Object.fromEntries(routed))
  const route = makeRouteText(layer)

  it.each(routed)('routes %j to the team the model picked', async (text, answer) => {
    const before = calls.length
    const result = await route(text)
    expect(result).toMatchObject({
      team: answer.team,
      category: answer.category,
      patientReply: answer.patientReply,
      reason: 'model',
    })
    expect(needsNurseNow(result)).toBe(false)
    expect(calls.length).toBe(before + 1)
    expect(calls.at(-1)?.patientText).toBe(text)
    expectWellFormed(result)
  })

  it('routes Spanish and keeps the Spanish read-back', async () => {
    const { layer } = scriptedModel({
      'necesito otra almohada': decision({
        team: 'care_aide',
        category: 'pillow',
        language: 'es',
        staffSummary: 'Patient requests another pillow',
        patientReply: 'Una almohada más.',
      }),
    })
    const result = await makeRouteText(layer)('necesito otra almohada')
    expect(result).toMatchObject({
      team: 'care_aide',
      language: 'es',
      patientReply: 'Una almohada más.',
      reason: 'model',
    })
    expectWellFormed(result)
  })

  it('clinical questions go to the nurse right away', async () => {
    const { layer } = scriptedModel({
      'can you ask my nurse about my meds': decision({
        team: 'nurse',
        category: 'medication_question',
        clinical: true,
        staffSummary: 'Patient has a question about medications',
        patientReply: 'A question about your medications.',
      }),
    })
    const result = await makeRouteText(layer)('can you ask my nurse about my meds')
    expect(result).toMatchObject({
      team: 'nurse',
      clinical: true,
      reason: 'clinical',
      patientReply: NURSE_NOTIFIED_EN,
    })
    expect(needsNurseNow(result)).toBe(true)
    expectWellFormed(result)
  })

  it('overrides a non-nurse team when the model says clinical', async () => {
    const { layer } = scriptedModel({
      'I feel dizzy, can I get some water': decision({
        team: 'care_aide',
        category: 'dizziness',
        clinical: true,
        patientReply: 'Some water.',
      }),
    })
    const result = await makeRouteText(layer)('I feel dizzy, can I get some water')
    expect(result).toMatchObject({
      team: 'nurse',
      category: 'dizziness',
      clinical: true,
      reason: 'clinical',
      patientReply: NURSE_NOTIFIED_EN,
    })
    expect(needsNurseNow(result)).toBe(true)
    expectWellFormed(result)
  })

  it('low confidence: to the nurse, quoting the patient', async () => {
    const { layer } = scriptedModel({
      'the thing is doing the thing again': decision({
        team: 'facilities',
        category: 'unknown_issue',
        confidence: 0.4,
        patientReply: 'Something to fix.',
      }),
    })
    const result = await makeRouteText(layer)('the thing is doing the thing again')
    expect(result).toMatchObject({
      team: 'nurse',
      confidence: 0.4,
      reason: 'low_confidence',
      patientReply: '“the thing is doing the thing again”',
    })
    expect(needsNurseNow(result)).toBe(false)
    expectWellFormed(result)
  })

  it('accepts confidence exactly at the 0.8 threshold', async () => {
    const { layer } = scriptedModel({
      'please fix the blinds': decision({
        team: 'facilities',
        category: 'blinds',
        confidence: 0.8,
      }),
    })
    const result = await makeRouteText(layer)('please fix the blinds')
    expect(result).toMatchObject({ team: 'facilities', reason: 'model' })
  })

  it('tidies the model output (one-line summary, snake_case category, language code)', async () => {
    const { layer } = scriptedModel({
      'mi televisor no funciona': decision({
        team: 'facilities',
        category: 'TV Remote!',
        staffSummary: 'TV not working\nin room',
        patientReply: '  El televisor\nno funciona.  ',
        language: 'Spanish',
      }),
    })
    const result = await makeRouteText(layer)('mi televisor no funciona')
    expect(result).toMatchObject({
      category: 'tv_remote',
      staffSummary: 'TV not working in room',
      patientReply: 'El televisor no funciona.',
      language: 'es',
      reason: 'model',
    })
  })

  it.each([
    ['names a team (en)', 'en', "I've let housekeeping know about the spill."],
    ['claims it was sent (en)', 'en', 'Your request was sent.'],
    ['names a team (es)', 'es', 'He avisado al personal de limpieza.'],
    ['says someone is coming (es)', 'es', 'Alguien de mantenimiento va a venir.'],
    ['names the nurse (de)', 'de', 'Ihre Pflegekraft kommt gleich.'],
    ['empty read-back', 'en', '   '],
  ])(
    'replaces a model read-back that %s with the patient’s words',
    async (_name, language, reply) => {
      const text = 'there is water all over the floor'
      const { layer } = scriptedModel({
        [text]: decision({
          team: 'housekeeping',
          category: 'spill',
          language,
          patientReply: reply,
        }),
      })
      const result = await makeRouteText(layer)(text)
      expect(result.reason).toBe('model')
      expect(result.patientReply).toBe(quotePatientWords(text, language))
      expectWellFormed(result)
    },
  )
})

describe('red flags (checked before the model, sent right away)', () => {
  it.each([
    ['I have chest pain', 'chest_pain', 'en', NURSE_NOTIFIED_EN],
    ["I can't breathe", 'breathing', 'en', NURSE_NOTIFIED_EN],
    ['I fell and I cannot get up', 'fall', 'en', NURSE_NOTIFIED_EN],
    ['my hand is bleeding', 'bleeding', 'en', NURSE_NOTIFIED_EN],
    ['me duele el pecho', 'chest_pain', 'es', NURSE_NOTIFIED_ES],
    ['no puedo respirar', 'breathing', 'es', NURSE_NOTIFIED_ES],
  ])(
    '%j goes to the nurse as urgent without calling the model',
    async (text, category, language, reply) => {
      const { layer, calls } = mockModel(() => Effect.succeed(JSON.stringify(decision())))
      const result = await makeRouteText(layer)(text)
      expect(calls).toHaveLength(0)
      expect(result).toMatchObject({
        team: 'nurse',
        category,
        urgency: 'urgent',
        clinical: true,
        reason: 'red_flag',
        language,
        patientReply: reply,
      })
      expect(needsNurseNow(result)).toBe(true)
      expect(result.staffSummary).toContain('RED FLAG')
      expectWellFormed(result)
    },
  )

  it('wins over a missing API key', async () => {
    const result = await routeText("I can't breathe")
    expect(result.reason).toBe('red_flag')
  })
})

describe('failure paths all go to the nurse', () => {
  const routeWith = (respond: Parameters<typeof mockModel>[0], timeoutMs?: number) =>
    makeRouteText(mockModel(respond).layer, { timeoutMs })('can I get another blanket')

  it('times out (short injected timeout) and goes to the nurse right away', async () => {
    const started = Date.now()
    const result = await routeWith(
      () => Effect.sleep('5 seconds').pipe(Effect.as(JSON.stringify(decision()))),
      50,
    )
    expect(result).toMatchObject({
      team: 'nurse',
      reason: 'timeout',
      category: 'unrouted',
      urgency: 'soon',
      confidence: 0,
      patientReply: NURSE_NOTIFIED_EN,
      staffSummary: 'Patient request: "can I get another blanket"',
    })
    expect(needsNurseNow(result)).toBe(true)
    expect(Date.now() - started).toBeLessThan(1000)
    expectWellFormed(result)
  })

  it.each([
    ['429 rate limit', aiError(new AiError.RateLimitError({})), 'rate_limited'],
    ['429 quota exhausted', aiError(new AiError.QuotaExhaustedError({})), 'rate_limited'],
    [
      'HTTP 500',
      aiError(new AiError.InternalProviderError({ description: 'upstream 500' })),
      'error',
    ],
    ['HTTP 401', aiError(new AiError.AuthenticationError({ kind: 'InvalidKey' })), 'error'],
    ['unknown provider error', aiError(new AiError.UnknownError({})), 'error'],
  ] as const)('%s', async (_name, error, reason) => {
    const result = await routeWith(() => Effect.fail(error))
    expect(result).toMatchObject({
      team: 'nurse',
      reason,
      category: 'unrouted',
      patientReply: NURSE_NOTIFIED_EN,
    })
    expectWellFormed(result)
  })

  it.each([
    ['not JSON at all', 'Sure! The patient needs a blanket.'],
    ['empty response', ''],
    ['truncated JSON', '{"team":"care_aide","category":"bla'],
    ['unknown team', JSON.stringify(decision({ team: 'doctor' as never }))],
    ['missing fields', JSON.stringify({ team: 'it', confidence: 0.99 })],
    ['confidence above 1', JSON.stringify(decision({ confidence: 1.5 }))],
    ['confidence below 0', JSON.stringify(decision({ confidence: -0.1 }))],
    ['wrong types', JSON.stringify({ ...decision(), clinical: 'no' })],
  ])('invalid output: %s', async (_name, raw) => {
    const result = await routeWith(() => Effect.succeed(raw))
    expect(result).toMatchObject({
      team: 'nurse',
      reason: 'invalid_output',
      patientReply: NURSE_NOTIFIED_EN,
    })
    expectWellFormed(result)
  })

  it('a thrown exception inside the model call', async () => {
    const result = await routeWith(() => {
      throw new Error('boom')
    })
    expect(result).toMatchObject({ team: 'nurse', reason: 'error' })
    expectWellFormed(result)
  })

  it('a defect while building the model layer', async () => {
    const broken = Layer.effect(LanguageModel.LanguageModel, Effect.die(new Error('no model')))
    const result = await makeRouteText(broken)('can I get another blanket')
    expect(result).toMatchObject({ team: 'nurse', reason: 'error' })
  })

  it('a layer that reports not configured', async () => {
    const unconfigured = Layer.effect(
      LanguageModel.LanguageModel,
      Effect.fail(new RouterNotConfigured({ message: 'no key' })),
    )
    const result = await makeRouteText(unconfigured)('can I get another blanket')
    expect(result).toMatchObject({ team: 'nurse', reason: 'not_configured' })
  })

  it('missing API key: no network, to the nurse quoting the patient', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const result = await routeText('can I get another blanket', { fetch })
    expect(fetch).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      team: 'nurse',
      reason: 'not_configured',
      category: 'unrouted',
      patientReply: '“can I get another blanket”',
    })
    expect(needsNurseNow(result)).toBe(false)
    expectWellFormed(result)
  })

  it('quotes long or multi-line text on one line', async () => {
    const text = `my thing\n\nis   weird ${'and more '.repeat(30)}`
    const result = await routeText(text)
    expect(result.reason).toBe('not_configured')
    expect(result.patientReply.startsWith('“my thing is weird and more')).toBe(true)
    expect(result.patientReply.endsWith('…”')).toBe(true)
    expectWellFormed(result)
  })

  it.each(['', '   ', '\n\t  '])('empty input %j asks again', async (text) => {
    const { layer, calls } = mockModel(() => Effect.succeed(JSON.stringify(decision())))
    const result = await makeRouteText(layer)(text)
    expect(calls).toHaveLength(0)
    expect(result).toMatchObject({
      team: 'nurse',
      reason: 'empty_input',
      patientReply: ASK_AGAIN_EN,
    })
    expect(needsNurseNow(result)).toBe(false)
    expectWellFormed(result)
  })

  it('localizes the nurse message when the language is recognisable', async () => {
    const result = await makeRouteText(
      mockModel(() => Effect.fail(aiError(new AiError.RateLimitError({})))).layer,
    )('necesito una manta por favor')
    expect(result).toMatchObject({
      reason: 'rate_limited',
      language: 'es',
      patientReply: NURSE_NOTIFIED_ES,
    })
    expect(result.staffSummary).toBe('Patient request (es): "necesito una manta por favor"')
  })
})

describe('IMMEDIATE_BY_REASON: which results tell the patient the nurse was alerted', () => {
  it('maps every reason as agreed', () => {
    expect(IMMEDIATE_BY_REASON).toEqual({
      model: false,
      red_flag: true,
      clinical: true,
      low_confidence: false,
      timeout: true,
      rate_limited: true,
      invalid_output: true,
      error: true,
      not_configured: false,
      empty_input: false,
    })
    expect(Object.keys(IMMEDIATE_BY_REASON).sort()).toEqual([...ROUTE_REASONS].sort())
  })

  it('clinical: true is immediate whatever the reason', () => {
    const result: RouteResult = { ...decision({ clinical: true }), reason: 'model' }
    expect(needsNurseNow(result)).toBe(true)
  })

  const scripted = (text: string, answer: RoutingDecision) =>
    makeRouteText(scriptedModel({ [text]: answer }).layer)(text)
  const failing = (respond: Parameters<typeof mockModel>[0]) =>
    makeRouteText(mockModel(respond).layer, { timeoutMs: 20 })('can I get another blanket')

  // One real router run per reason. Typed as a full record: a new reason needs a scenario here.
  const scenarios: Record<RouteReason, () => Promise<RouteResult>> = {
    model: () => scripted('can I get another blanket', decision()),
    red_flag: () => routeText('I have chest pain'),
    clinical: () => scripted('I feel dizzy', decision({ category: 'dizziness', clinical: true })),
    low_confidence: () => scripted('the thing is doing the thing', decision({ confidence: 0.3 })),
    timeout: () => failing(() => Effect.never),
    rate_limited: () => failing(() => Effect.fail(aiError(new AiError.RateLimitError({})))),
    invalid_output: () => failing(() => Effect.succeed('not json')),
    error: () =>
      failing(() => Effect.fail(aiError(new AiError.InternalProviderError({ description: 'x' })))),
    not_configured: () => routeText('can I get another blanket'),
    empty_input: () => routeText('   '),
  }

  it.each(ROUTE_REASONS)(
    '%s: needsNurseNow and patientReply follow the mapping',
    async (reason) => {
      const result = await scenarios[reason]()
      expect(result.reason).toBe(reason)
      expect(needsNurseNow(result)).toBe(IMMEDIATE_BY_REASON[reason])
      if (IMMEDIATE_BY_REASON[reason]) {
        expect(result.team).toBe('nurse')
        expect(result.patientReply).toBe(NURSE_NOTIFIED_EN)
      } else if (reason === 'empty_input') {
        expect(result.patientReply).toBe(ASK_AGAIN_EN)
      } else if (reason === 'model') {
        expect(result.patientReply).toBe('An extra blanket.')
      } else {
        // low_confidence, not_configured: a read-back quoting the patient's own words
        expect(result.patientReply).toMatch(/^“.+”$/)
      }
      expectWellFormed(result)
    },
  )
})

describe('room language setting', () => {
  it('Spanish setting + English text: Spanish nurse message on an immediate fallback', async () => {
    const { layer } = mockModel(() => Effect.fail(aiError(new AiError.RateLimitError({}))))
    const result = await makeRouteText(layer)('can I get another blanket', { language: 'es' })
    expect(result).toMatchObject({
      reason: 'rate_limited',
      language: 'es',
      patientReply: NURSE_NOTIFIED_ES,
    })
  })

  it('Spanish setting + English text: the label quotes the patient and is tagged es', async () => {
    const result = await routeText('can I get another blanket', { language: 'es' })
    expect(result).toMatchObject({
      reason: 'not_configured',
      language: 'es',
      patientReply: '“can I get another blanket”',
    })
  })

  it('Spanish setting + English red flag: still detected, Spanish reply', async () => {
    const result = await routeText("I can't breathe", { language: 'es' })
    expect(result).toMatchObject({
      reason: 'red_flag',
      category: 'breathing',
      language: 'es',
      patientReply: NURSE_NOTIFIED_ES,
    })
  })

  it('Polish setting localizes timeouts too', async () => {
    const { layer } = mockModel(() => Effect.never)
    const result = await makeRouteText(layer, { timeoutMs: 20 })('can I get another blanket', {
      language: 'pl',
    })
    expect(result).toMatchObject({
      reason: 'timeout',
      language: 'pl',
      patientReply: 'Pielęgniarka już idzie.',
    })
  })

  it.each([
    ['tl', 'Papunta na ang nars mo.'],
    ['he', 'האחות כבר בדרך.'],
    ['ar', 'ممرضتك في الطريق.'],
    ['ko', '간호사가 오고 있어요.'],
    ['vi', 'Y tá đang tới.'],
  ] as const)('%s setting localizes the nurse message on a red flag', async (language, reply) => {
    const result = await routeText('I have chest pain', { language })
    expect(result).toMatchObject({ reason: 'red_flag', language, patientReply: reply })
  })

  it('"auto" keeps detection', async () => {
    expect(await routeText('necesito otra almohada', { language: 'auto' })).toMatchObject({
      language: 'es',
      patientReply: '“necesito otra almohada”',
    })
    expect(await routeText("I can't breathe", { language: 'auto' })).toMatchObject({
      reason: 'red_flag',
      language: 'en',
      patientReply: NURSE_NOTIFIED_EN,
    })
  })

  it('an unknown setting behaves like "auto"', async () => {
    const result = await routeText('necesito otra almohada', { language: 'xx' as never })
    expect(result.language).toBe('es')
  })

  it('tells the model which language to read back in and forces the language code', async () => {
    const { layer, calls } = scriptedModel({
      'can I get another blanket': decision({
        patientReply: '담요 하나 더.',
        language: 'en',
      }),
    })
    const result = await makeRouteText(layer)('can I get another blanket', { language: 'ko' })
    expect(calls[0]?.system).toContain('room language is set to Korean')
    expect(calls[0]?.system).toContain('set language to "ko"')
    expect(result).toMatchObject({
      team: 'care_aide',
      language: 'ko',
      patientReply: '담요 하나 더.',
      reason: 'model',
    })
  })

  it('auto mode does not add a language instruction', async () => {
    const { layer, calls } = scriptedModel({ 'can I get another blanket': decision() })
    await makeRouteText(layer)('can I get another blanket')
    expect(calls[0]?.system).not.toContain('room language is set to')
  })

  it('the prompt asks for a read-back that names no team', async () => {
    const { layer, calls } = scriptedModel({ 'can I get another blanket': decision() })
    await makeRouteText(layer)('can I get another blanket')
    expect(calls[0]?.system).toContain('read-back')
    expect(calls[0]?.system).toContain('do not mention any team')
  })
})

describe('routeText never rejects', () => {
  const nasty: ReadonlyArray<unknown> = [undefined, null, 42, {}, [], Symbol('x')]

  it.each(nasty.map((value) => [String(typeof value), value]))(
    'non-string input (%s) resolves to a nurse decision',
    async (_type, value) => {
      await expect(routeText(value as string)).resolves.toMatchObject({ team: 'nurse' })
      const { layer } = mockModel(() => Effect.succeed(JSON.stringify(decision())))
      await expect(makeRouteText(layer)(value as string)).resolves.toMatchObject({
        team: 'nurse',
      })
    },
  )

  it('resolves for every failure mode', async () => {
    const failures = [
      () => Effect.fail(aiError(new AiError.RateLimitError({}))),
      () => Effect.succeed('nope'),
      () => Effect.die(new Error('defect')),
      () => Effect.interrupt,
      () => {
        throw new Error('sync throw')
      },
    ]
    for (const respond of failures) {
      const route = makeRouteText(mockModel(respond).layer, { timeoutMs: 50 })
      await expect(route('can I get another blanket')).resolves.toMatchObject({ team: 'nurse' })
    }
  })
})

describe('routeTextEffect with the TestClock', () => {
  effectIt.effect('times out after ROUTER_TIMEOUT_MS of virtual time', () =>
    Effect.gen(function* () {
      const { layer } = mockModel(() =>
        Effect.sleep('10 seconds').pipe(Effect.as(JSON.stringify(decision()))),
      )
      const fiber = yield* Effect.forkChild(routeTextEffect('can I get another blanket', layer))
      yield* TestClock.adjust(ROUTER_TIMEOUT_MS)
      const result = yield* Fiber.join(fiber)
      expect(result).toMatchObject({ team: 'nurse', reason: 'timeout' })
    }),
  )

  effectIt.effect('a model answering just under the limit is used', () =>
    Effect.gen(function* () {
      const { layer } = mockModel(() =>
        Effect.sleep(ROUTER_TIMEOUT_MS - 100).pipe(
          Effect.as(JSON.stringify(decision({ team: 'facilities', category: 'tv_remote' }))),
        ),
      )
      const fiber = yield* Effect.forkChild(routeTextEffect('the TV remote is broken', layer))
      yield* TestClock.adjust(ROUTER_TIMEOUT_MS - 100)
      const result = yield* Fiber.join(fiber)
      expect(result).toMatchObject({ team: 'facilities', reason: 'model' })
    }),
  )
})
