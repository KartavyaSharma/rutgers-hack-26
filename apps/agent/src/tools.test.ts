import { draftReadBack, patientMessage, type RouteResult } from '@bell/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BellTools, type Classifier, type ClassifyInput } from './tools'

const API = { appUrl: 'http://bell.test', agentSharedSecret: 'test-secret' }

const routine = (overrides: Partial<RouteResult> = {}): RouteResult => ({
  team: 'care_aide',
  category: 'comfort_items',
  urgency: 'routine',
  clinical: false,
  confidence: 0.93,
  staffSummary: 'Patient would like an extra blanket',
  patientReply: 'An extra blanket.',
  language: 'en',
  reason: 'model',
  ...overrides,
})

interface Call {
  path: string
  body: unknown
  auth: string | null
}

/** A fake web API. Routes can be overridden per test with a status or a thrown error. */
function fakeApi() {
  const calls: Call[] = []
  const failures = new Map<string, number | 'network'>()
  let draftSeq = 0
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    calls.push({
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get('authorization'),
    })
    const key = url.pathname.replace(/\/api\/drafts\/[^/]+\//, '/api/drafts/:id/')
    const failure = failures.get(key)
    if (failure === 'network') throw new TypeError('fetch failed')
    if (failure !== undefined) return Response.json({ error: 'nope' }, { status: failure })
    if (key === '/api/requests') return Response.json({ request: { id: 'req-1' } }, { status: 201 })
    if (key === '/api/drafts') {
      return Response.json({ draft: { id: `draft-${++draftSeq}` } }, { status: 201 })
    }
    if (key === '/api/drafts/:id/confirm') return Response.json({ request: { id: 'req-2' } })
    if (key === '/api/drafts/:id/discard') return Response.json({ draft: {} })
    return Response.json({}, { status: 404 })
  })
  return { calls, failures, fetchMock, paths: () => calls.map((c) => c.path) }
}

let api: ReturnType<typeof fakeApi>

beforeEach(() => {
  api = fakeApi()
  vi.stubGlobal('fetch', api.fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeTools(classify: Classifier = async () => routine()) {
  return new BellTools({ roomId: '412', roomLanguage: 'auto', api: API, classify })
}

const REQUEST = {
  request: 'can I get another blanket',
  readBack: 'An extra blanket.',
  staffSummary: 'Patient would like an extra blanket',
}

describe('classifyAndDraft', () => {
  it('creates a draft and returns the read-back with the confirm prompt', async () => {
    const classify = vi.fn<Classifier>(async () => routine())
    const tools = makeTools(classify)

    const result = await tools.classifyAndDraft(REQUEST)

    expect(classify).toHaveBeenCalledWith({
      text: REQUEST.request,
      language: 'auto',
      staffSummary: REQUEST.staffSummary,
      readBack: REQUEST.readBack,
    } satisfies ClassifyInput)
    expect(result).toEqual({
      outcome: 'draft',
      draftId: 'draft-1',
      readBack: 'An extra blanket.',
      say: draftReadBack(routine()),
    })
    expect(tools.pendingDraftId).toBe('draft-1')
    expect(api.calls).toEqual([
      {
        path: '/api/drafts',
        body: { roomId: '412', source: 'voice', text: REQUEST.request, decision: routine() },
        auth: 'Bearer test-secret',
      },
    ])
  })

  it('never puts the team in what the patient hears', async () => {
    const result = await makeTools().classifyAndDraft(REQUEST)
    expect(JSON.stringify(result)).not.toMatch(/care.?aide/i)
  })

  it('sends clinical requests to the nurse right away, with no draft', async () => {
    const tools = makeTools(async () =>
      routine({ team: 'nurse', clinical: true, reason: 'clinical', patientReply: '' }),
    )

    const result = await tools.classifyAndDraft(REQUEST)

    expect(result).toEqual({
      outcome: 'sent_to_nurse_now',
      say: patientMessage('nurse_notified', 'en'),
    })
    expect(api.paths()).toEqual(['/api/requests'])
    expect(tools.pendingDraftId).toBeUndefined()
  })

  it('says save_failed when the draft cannot be created', async () => {
    api.failures.set('/api/drafts', 500)
    const tools = makeTools(async () => routine({ language: 'es' }))

    const result = await tools.classifyAndDraft(REQUEST)

    expect(result).toEqual({ outcome: 'failed', say: patientMessage('save_failed', 'es') })
    expect(tools.pendingDraftId).toBeUndefined()
  })

  it('says save_failed when the nurse-now request cannot be saved', async () => {
    api.failures.set('/api/requests', 'network')
    const tools = makeTools(async () => routine({ team: 'nurse', reason: 'red_flag' }))

    const result = await tools.classifyAndDraft(REQUEST)

    expect(result).toEqual({ outcome: 'failed', say: patientMessage('save_failed', 'en') })
  })

  it('lets a newer request replace an older one that is still classifying', async () => {
    let releaseFirst: (value: RouteResult) => void = () => {}
    const classify = vi
      .fn<Classifier>()
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockImplementationOnce(async () => routine({ patientReply: 'Some water.' }))
    const tools = makeTools(classify)

    const first = tools.classifyAndDraft(REQUEST)
    const second = await tools.classifyAndDraft({ ...REQUEST, readBack: 'Some water.' })
    releaseFirst(routine())

    expect(second).toMatchObject({ outcome: 'draft', draftId: 'draft-1' })
    expect(await first).toEqual({ outcome: 'superseded' })
    expect(api.paths()).toEqual(['/api/drafts'])
    expect(tools.pendingDraftId).toBe('draft-1')
  })

  it('discards the older pending draft when a newer one is created', async () => {
    const tools = makeTools()
    await tools.classifyAndDraft(REQUEST)
    await tools.classifyAndDraft(REQUEST)
    await vi.waitFor(() => expect(api.paths()).toContain('/api/drafts/draft-1/discard'))
    expect(tools.pendingDraftId).toBe('draft-2')
  })

  it('still sends a superseded request that must go to the nurse', async () => {
    let releaseFirst: (value: RouteResult) => void = () => {}
    const classify = vi
      .fn<Classifier>()
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockImplementationOnce(async () => routine())
    const tools = makeTools(classify)

    const first = tools.classifyAndDraft(REQUEST)
    await tools.classifyAndDraft(REQUEST)
    releaseFirst(routine({ team: 'nurse', clinical: true, reason: 'clinical' }))

    expect(await first).toMatchObject({ outcome: 'sent_to_nurse_now' })
    expect(api.paths()).toContain('/api/requests')
  })
})

describe('confirmDraft', () => {
  it('confirms the pending draft', async () => {
    const tools = makeTools()
    await tools.classifyAndDraft(REQUEST)

    const result = await tools.confirmDraft('draft-1')

    expect(result).toEqual({ outcome: 'sent', say: patientMessage('sent', 'en') })
    expect(api.calls.at(-1)).toMatchObject({
      path: '/api/drafts/draft-1/confirm',
      auth: 'Bearer test-secret',
    })
    expect(tools.pendingDraftId).toBeUndefined()
  })

  it('acts on the pending draft when no id is given', async () => {
    const tools = makeTools()
    await tools.classifyAndDraft(REQUEST)
    expect(await tools.confirmDraft()).toMatchObject({ outcome: 'sent' })
    expect(api.paths().at(-1)).toBe('/api/drafts/draft-1/confirm')
  })

  it('reports no_pending_draft when nothing is waiting', async () => {
    expect(await makeTools().confirmDraft()).toEqual({ outcome: 'no_pending_draft' })
    expect(api.calls).toEqual([])
  })

  it('says save_failed and keeps the draft pending when the confirm call fails', async () => {
    const tools = makeTools()
    await tools.classifyAndDraft(REQUEST)
    api.failures.set('/api/drafts/:id/confirm', 503)

    expect(await tools.confirmDraft()).toEqual({
      outcome: 'failed',
      say: patientMessage('save_failed', 'en'),
    })
    expect(tools.pendingDraftId).toBe('draft-1')
  })

  it('drops the draft when the server says it was discarded (409)', async () => {
    const tools = makeTools()
    await tools.classifyAndDraft(REQUEST)
    api.failures.set('/api/drafts/:id/confirm', 409)

    expect(await tools.confirmDraft()).toMatchObject({ outcome: 'failed' })
    expect(tools.pendingDraftId).toBeUndefined()
  })

  it('is a no-op success after the tablet already sent the draft', async () => {
    const tools = makeTools()
    await tools.classifyAndDraft(REQUEST)

    expect(tools.tabletConfirmed('draft-1')).toEqual({ matched: true, language: 'en' })
    const before = api.calls.length

    expect(await tools.confirmDraft()).toEqual({
      outcome: 'sent',
      say: patientMessage('sent', 'en'),
    })
    expect(await tools.confirmDraft('draft-1')).toMatchObject({ outcome: 'sent' })
    expect(api.calls.length).toBe(before)
  })
})

describe('tabletConfirmed', () => {
  it('ignores drafts that are not pending', () => {
    expect(makeTools().tabletConfirmed('draft-9')).toEqual({ matched: false })
  })

  it('handles a tap that arrives before the draft call returns', async () => {
    const tools = makeTools()
    tools.tabletConfirmed('draft-1')

    expect(await tools.classifyAndDraft(REQUEST)).toEqual({
      outcome: 'sent',
      say: patientMessage('sent', 'en'),
    })
    expect(tools.pendingDraftId).toBeUndefined()
  })
})

describe('cancelDraft', () => {
  it('discards the pending draft', async () => {
    const tools = makeTools()
    await tools.classifyAndDraft(REQUEST)

    expect(await tools.cancelDraft()).toEqual({ outcome: 'cancelled' })
    expect(api.paths().at(-1)).toBe('/api/drafts/draft-1/discard')
    expect(tools.pendingDraftId).toBeUndefined()
  })

  it('reports no_pending_draft when nothing is waiting', async () => {
    expect(await makeTools().cancelDraft()).toEqual({ outcome: 'no_pending_draft' })
    expect(api.calls).toEqual([])
  })

  it('drops a classification that is still running', async () => {
    let release: (value: RouteResult) => void = () => {}
    const tools = makeTools(() => new Promise((resolve) => (release = resolve)))

    const running = tools.classifyAndDraft(REQUEST)
    expect(await tools.cancelDraft()).toEqual({ outcome: 'cancelled' })
    release(routine())

    expect(await running).toEqual({ outcome: 'superseded' })
    expect(api.calls).toEqual([])
  })

  it('still reports cancelled when the discard call fails (nothing is ever sent)', async () => {
    const tools = makeTools()
    await tools.classifyAndDraft(REQUEST)
    api.failures.set('/api/drafts/:id/discard', 500)

    expect(await tools.cancelDraft()).toEqual({ outcome: 'cancelled' })
    expect(tools.pendingDraftId).toBeUndefined()
  })
})

describe('callMyNurse', () => {
  it('sends an immediate nurse_call request with the patient words', async () => {
    const tools = makeTools()
    tools.heard({ text: 'my IV arm is sore', language: 'es' })

    const result = await tools.callMyNurse({ reason: 'IV site is sore', clinical: true })

    expect(result).toEqual({
      outcome: 'sent_to_nurse_now',
      say: patientMessage('nurse_notified', 'es'),
    })
    expect(api.calls).toEqual([
      {
        path: '/api/requests',
        auth: 'Bearer test-secret',
        body: {
          roomId: '412',
          source: 'voice',
          text: 'my IV arm is sore',
          decision: expect.objectContaining({
            team: 'nurse',
            category: 'nurse_call',
            clinical: true,
            reason: 'clinical',
            language: 'es',
          }),
        },
      },
    ])
  })

  it('says save_failed when the request cannot be saved', async () => {
    api.failures.set('/api/requests', 500)
    expect(await makeTools().callMyNurse({ reason: 'wants the nurse', clinical: false })).toEqual({
      outcome: 'failed',
      say: patientMessage('save_failed', 'en'),
    })
  })
})

describe('redFlagCheck', () => {
  it('notifies the nurse urgently without asking the classifier', async () => {
    const classify = vi.fn<Classifier>()
    const tools = makeTools(classify)

    const result = await tools.redFlagCheck('me duele el pecho')

    expect(result).toEqual({
      outcome: 'sent_to_nurse_now',
      say: patientMessage('nurse_notified', 'es'),
    })
    expect(classify).not.toHaveBeenCalled()
    expect(api.calls).toEqual([
      expect.objectContaining({
        path: '/api/requests',
        body: expect.objectContaining({
          text: 'me duele el pecho',
          decision: expect.objectContaining({
            team: 'nurse',
            category: 'chest_pain',
            urgency: 'urgent',
            clinical: true,
            reason: 'red_flag',
          }),
        }),
      }),
    ])
  })

  it('uses the room language when one is set', async () => {
    const tools = new BellTools({ roomId: '412', roomLanguage: 'fr', api: API })
    expect(await tools.redFlagCheck('I have chest pain')).toEqual({
      outcome: 'sent_to_nurse_now',
      say: patientMessage('nurse_notified', 'fr'),
    })
  })

  it('returns undefined and calls nothing for an ordinary request', async () => {
    expect(await makeTools().redFlagCheck('can I get a blanket')).toBeUndefined()
    expect(api.calls).toEqual([])
  })

  it('says save_failed when the urgent request cannot be saved', async () => {
    api.failures.set('/api/requests', 'network')
    expect(await makeTools().redFlagCheck('I fell out of bed')).toEqual({
      outcome: 'failed',
      say: patientMessage('save_failed', 'en'),
    })
  })
})
