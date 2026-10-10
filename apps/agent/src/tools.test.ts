import { patientMessage, type RouteResult } from '@bell/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Announcement,
  BellTools,
  type BellToolsOptions,
  type Classifier,
  type ClassifyInput,
  EmergencyNotes,
} from './tools'

const API = { appUrl: 'http://bell.test', agentSharedSecret: 'test-secret' }
const DEBOUNCE = 300

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
  method: string
  path: string
  body: unknown
  auth: string | null
}

/** A fake web API. Routes can be made to fail per test with a status or a network error. */
function fakeApi() {
  const calls: Call[] = []
  const failures = new Map<string, number | 'network'>()
  let requestSeq = 0
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get('authorization'),
    })
    const key = `${method} ${url.pathname.replace(/^\/api\/requests\/.+$/, '/api/requests/:id')}`
    const failure = failures.get(key)
    if (failure === 'network') throw new TypeError('fetch failed')
    if (failure !== undefined) return Response.json({ error: 'nope' }, { status: failure })
    if (key === 'POST /api/requests') {
      return Response.json({ request: { id: `req-${++requestSeq}` } }, { status: 201 })
    }
    if (key === 'PATCH /api/requests/:id') return Response.json({ request: {} })
    return Response.json({}, { status: 404 })
  })
  return {
    calls,
    failures,
    fetchMock,
    routes: () => calls.map((c) => `${c.method} ${c.path}`),
  }
}

let api: ReturnType<typeof fakeApi>
let announced: Announcement[]

beforeEach(() => {
  api = fakeApi()
  announced = []
  vi.stubGlobal('fetch', api.fetchMock)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function makeTools(
  classify: Classifier = async () => routine(),
  options: Partial<BellToolsOptions> = {},
) {
  return new BellTools({
    roomId: '412',
    roomLanguage: 'auto',
    api: API,
    classify,
    announce: (a) => announced.push(a),
    ...options,
  })
}

/** Lets the debounced announcement fire. */
const flush = () => vi.advanceTimersByTimeAsync(DEBOUNCE)

const BLANKET = {
  request: 'can I get another blanket',
  readBack: 'An extra blanket.',
  staffSummary: 'Patient would like an extra blanket',
}

describe('sendRequest', () => {
  it('classifies, sends right away, then announces the read-back and "sent"', async () => {
    const classify = vi.fn<Classifier>(async () => routine())
    const tools = makeTools(classify)

    expect(await tools.sendRequest(BLANKET)).toEqual({
      outcome: 'sent',
      requestId: 'req-1',
      nurse: false,
    })
    expect(classify).toHaveBeenCalledWith({
      text: BLANKET.request,
      language: 'auto',
      staffSummary: BLANKET.staffSummary,
      readBack: BLANKET.readBack,
    } satisfies ClassifyInput)
    expect(api.calls).toEqual([
      {
        method: 'POST',
        path: '/api/requests',
        body: { roomId: '412', source: 'voice', text: BLANKET.request, decision: routine() },
        auth: 'Bearer test-secret',
      },
    ])

    expect(announced).toEqual([])
    await flush()
    expect(announced).toEqual([
      {
        say: patientMessage('sent', 'en'),
        note: expect.stringContaining('Sent: "An extra blanket." (request req-1)'),
      },
    ])
    expect(tools.sentRequestIds).toEqual(['req-1'])
  })

  it('confirms two requests that land together once, without reading them back', async () => {
    const tools = makeTools(
      vi
        .fn<Classifier>()
        .mockResolvedValueOnce(routine({ patientReply: 'An extra pillow.' }))
        .mockResolvedValueOnce(routine({ patientReply: 'Some water.' })),
    )

    await Promise.all([
      tools.sendRequest({ ...BLANKET, readBack: 'An extra pillow.' }),
      tools.sendRequest({ ...BLANKET, readBack: 'Some water.' }),
    ])
    await flush()

    expect(api.routes()).toEqual(['POST /api/requests', 'POST /api/requests'])
    expect(announced).toHaveLength(1)
    expect(announced[0]?.say).toBe(patientMessage('sent_two', 'en'))
    expect(announced[0]?.say).not.toMatch(/pillow|water/i)
    expect(announced[0]?.note).toContain('"An extra pillow."')
    expect(tools.sentRequestIds).toEqual(['req-1', 'req-2'])
  })

  it('says "all sent" for three or more requests at once', async () => {
    const tools = makeTools()
    await Promise.all([
      tools.sendRequest(BLANKET),
      tools.sendRequest(BLANKET),
      tools.sendRequest(BLANKET),
    ])
    await flush()
    expect(announced).toHaveLength(1)
    expect(announced[0]?.say).toBe(patientMessage('sent_many', 'en'))
  })

  it('only says the nurse is coming when a nurse-now result is among them', async () => {
    const tools = makeTools(
      vi
        .fn<Classifier>()
        .mockResolvedValueOnce(routine())
        .mockResolvedValueOnce(routine({ team: 'nurse', clinical: true, reason: 'clinical' })),
    )
    await Promise.all([tools.sendRequest(BLANKET), tools.sendRequest(BLANKET)])
    await flush()
    expect(announced).toHaveLength(1)
    expect(announced[0]?.say).toBe(patientMessage('nurse_notified', 'en'))
  })

  it('tells the patient the nurse was alerted for a nurse-now decision, never naming a team', async () => {
    const tools = makeTools(async () =>
      routine({ team: 'nurse', clinical: true, reason: 'clinical' }),
    )

    expect(await tools.sendRequest(BLANKET)).toMatchObject({ outcome: 'sent', nurse: true })
    await flush()

    expect(announced).toEqual([
      {
        say: patientMessage('nurse_notified', 'en'),
        note: expect.stringContaining('Sent to the nurse right away'),
      },
    ])
  })

  it('never says the team for a normal request', async () => {
    const tools = makeTools()
    await tools.sendRequest(BLANKET)
    await flush()
    expect(announced[0]?.say).not.toMatch(/care.?aide/i)
  })

  it('says save_failed in the patient language when the request cannot be sent', async () => {
    api.failures.set('POST /api/requests', 500)
    const tools = makeTools(async () => routine({ language: 'es' }))

    expect(await tools.sendRequest(BLANKET)).toEqual({ outcome: 'failed' })
    await flush()

    expect(announced).toEqual([
      { say: patientMessage('save_failed', 'es'), note: expect.stringContaining('Could not send') },
    ])
    expect(tools.sentRequestIds).toEqual([])
  })

  it('says save_failed on a network error', async () => {
    api.failures.set('POST /api/requests', 'network')
    expect(await makeTools().sendRequest(BLANKET)).toEqual({ outcome: 'failed' })
    await flush()
    expect(announced[0]?.say).toBe(patientMessage('save_failed', 'en'))
  })
})

describe('cancelRequest', () => {
  it('cancels the most recent request and announces "cancelled"', async () => {
    const tools = makeTools()
    await tools.sendRequest(BLANKET)
    await tools.sendRequest(BLANKET)
    await flush()
    announced = []

    expect(await tools.cancelRequest()).toEqual({ outcome: 'cancelled', requestId: 'req-2' })
    expect(api.calls.at(-1)).toEqual({
      method: 'PATCH',
      path: '/api/requests/req-2',
      body: { action: 'cancel' },
      auth: 'Bearer test-secret',
    })
    expect(announced).toEqual([
      { say: patientMessage('cancelled', 'en'), note: expect.stringContaining('Cancelled') },
    ])
    expect(tools.sentRequestIds).toEqual(['req-1'])
  })

  it('cancels a given request id', async () => {
    const tools = makeTools()
    await tools.sendRequest(BLANKET)
    await tools.sendRequest(BLANKET)

    expect(await tools.cancelRequest('req-1')).toMatchObject({ requestId: 'req-1' })
    expect(tools.sentRequestIds).toEqual(['req-2'])
  })

  it('waits for a send still running, so "cancel that" cancels what was just asked for', async () => {
    let classified: (value: RouteResult) => void = () => {}
    const tools = makeTools(() => new Promise((resolve) => (classified = resolve)))

    const sending = tools.sendRequest(BLANKET)
    const cancelling = tools.cancelRequest('last')
    classified(routine())
    await sending

    expect(await cancelling).toEqual({ outcome: 'cancelled', requestId: 'req-1' })
  })

  it('a correction (cancel, then send) cancels the old request, not the new one', async () => {
    const tools = makeTools()
    await tools.sendRequest({ ...BLANKET, readBack: 'An extra pillow.' })

    const cancelled = tools.cancelRequest('last')
    const resent = tools.sendRequest(BLANKET)

    expect(await cancelled).toMatchObject({ outcome: 'cancelled', requestId: 'req-1' })
    expect(await resent).toMatchObject({ outcome: 'sent', requestId: 'req-2' })
    expect(tools.sentRequestIds).toEqual(['req-2'])
  })

  it('reports nothing_to_cancel without calling the API', async () => {
    expect(await makeTools().cancelRequest()).toEqual({ outcome: 'nothing_to_cancel' })
    expect(api.calls).toEqual([])
    expect(announced).toEqual([{ note: expect.stringContaining('no request to cancel') }])
  })

  it('says nothing alarming when the cancel call fails, and keeps the request', async () => {
    const tools = makeTools()
    await tools.sendRequest(BLANKET)
    await flush()
    announced = []
    api.failures.set('PATCH /api/requests/:id', 500)

    expect(await tools.cancelRequest()).toEqual({ outcome: 'failed', requestId: 'req-1' })
    expect(announced).toEqual([{ note: expect.stringContaining('still active') }])
    expect(tools.sentRequestIds).toEqual(['req-1'])
  })
})

describe('callMyNurse', () => {
  it('sends an immediate nurse_call request with the patient words', async () => {
    const tools = makeTools()
    tools.heard({ text: 'my IV arm is sore', language: 'es' })

    expect(await tools.callMyNurse({ reason: 'IV site is sore', clinical: true })).toEqual({
      outcome: 'sent',
      requestId: 'req-1',
      nurse: true,
    })
    expect(api.calls[0]).toEqual({
      method: 'POST',
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
    })
    await flush()
    expect(announced[0]?.say).toBe(patientMessage('nurse_notified', 'es'))
  })

  it('says save_failed when the request cannot be saved', async () => {
    api.failures.set('POST /api/requests', 500)
    expect(await makeTools().callMyNurse({ reason: 'wants the nurse', clinical: false })).toEqual({
      outcome: 'failed',
    })
    await flush()
    expect(announced[0]?.say).toBe(patientMessage('save_failed', 'en'))
  })
})

describe('redFlagCheck', () => {
  it('notifies the nurse urgently without asking the classifier', async () => {
    const classify = vi.fn<Classifier>()
    const tools = makeTools(classify)

    expect(await tools.redFlagCheck('me duele el pecho')).toEqual({
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
    // Not voice-cancellable.
    expect(tools.sentRequestIds).toEqual([])
  })

  it('uses the room language when one is set', async () => {
    const tools = makeTools(undefined, { roomLanguage: 'ko' })
    expect(await tools.redFlagCheck('I have chest pain')).toEqual({
      outcome: 'sent_to_nurse_now',
      say: patientMessage('nurse_notified', 'ko'),
    })
  })

  it('returns undefined and calls nothing for an ordinary request', async () => {
    expect(await makeTools().redFlagCheck('can I get a blanket')).toBeUndefined()
    expect(api.calls).toEqual([])
  })

  it('says save_failed when the urgent request cannot be saved', async () => {
    api.failures.set('POST /api/requests', 'network')
    expect(await makeTools().redFlagCheck('I fell out of bed')).toEqual({
      outcome: 'failed',
      say: patientMessage('save_failed', 'en'),
    })
  })
})

describe('EmergencyNotes', () => {
  const notes = () => new EmergencyNotes({ requestId: 'em-1', api: API })

  it('adds each turn as a note and says "noted" only the first time', async () => {
    const emergency = notes()

    expect(await emergency.add('I fell and hit my head', 'en')).toBe(
      patientMessage('emergency_noted', 'en'),
    )
    expect(await emergency.add('it is bleeding a little', 'en')).toBeUndefined()
    expect(api.calls).toEqual([
      {
        method: 'PATCH',
        path: '/api/requests/em-1',
        body: { action: 'add_note', text: 'I fell and hit my head' },
        auth: 'Bearer test-secret',
      },
      {
        method: 'PATCH',
        path: '/api/requests/em-1',
        body: { action: 'add_note', text: 'it is bleeding a little' },
        auth: 'Bearer test-secret',
      },
    ])
  })

  it('says nothing when a note fails, and acknowledges the next one that works', async () => {
    const emergency = notes()
    api.failures.set('PATCH /api/requests/:id', 'network')
    expect(await emergency.add('help', 'es')).toBeUndefined()

    api.failures.clear()
    expect(await emergency.add('me caí', 'es')).toBe(patientMessage('emergency_noted', 'es'))
  })
})
