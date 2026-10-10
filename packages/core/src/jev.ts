// Client for Jev, TypeSafe AI's hosted classification model (POST /v1/systemone).
// Docs: https://docs.typesafe.ai/api
import { Context, Effect, Layer, Redacted, Schema } from 'effect'
import {
  FetchHttpClient,
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/http'
import {
  RouterInvalidOutput,
  RouterModelFailure,
  RouterNotConfigured,
  RouterRateLimited,
} from './errors'
import { oneLine } from './language'
import { type GroupId, REQUEST_GROUPS, TEAMS, type Team, URGENCIES, type Urgency } from './taxonomy'

export const TYPESAFE_API_BASE = 'https://api.typesafe.ai'
export const DEFAULT_JEV_MODEL = 'jev-latest'

// Choice criteria: one description per label (the API allows up to 255 labels).
// Typed as full records so a new team or urgency level needs a description here.
const TEAM_CRITERIA: Record<Team, string> = {
  nurse:
    'Anything medical: symptoms, pain, medication, IV or monitor alarms, questions for the care team, or anything unclear.',
  care_aide:
    'Comfort and personal help: water, ice, snacks, blankets, pillows, socks, bathroom help, repositioning.',
  housekeeping: 'Cleaning: spills, a dirty room or bathroom, trash, linens.',
  facilities: 'Something broken in the room: TV, lights, bed controls, temperature, blinds.',
  food: 'Meals: meal trays, menus, diet, wrong or missing meals.',
  it: 'Technology: Wi-Fi, the tablet, phone, laptop, internet.',
}

const URGENCY_CRITERIA: Record<Urgency, string> = {
  urgent: 'The patient may be in danger right now.',
  soon: 'Should be handled within about 15 minutes, for example bathroom help, pain, or a spill on the floor.',
  routine: 'Can wait, for example a menu, the TV remote, or an extra blanket.',
}

// The home screen's request groups, so a classified request gets the same icon as its button.
const GROUP_CRITERIA: Record<GroupId, string> = {
  water_food: 'Water, ice chips, a drink, a snack, a meal tray or anything about food.',
  bathroom: 'Help getting to the bathroom, a bedpan or a urinal.',
  comfort: 'Comfort items: a blanket, pillow, socks.',
  reposition: 'Help moving, sitting up or changing position in bed.',
  beeping: 'A device, pump or monitor is beeping or alarming.',
  cleaning: 'Cleaning: a spill, the room, the bathroom, trash, linens.',
  fix_something:
    'Something broken or not working: TV, remote, lights, Wi-Fi, the tablet, bed controls, temperature, blinds.',
  ask_care_team:
    'A question or anything else for the care team: pain, symptoms, medication, or anything unclear.',
}

const GROUP_IDS: ReadonlyArray<GroupId> = REQUEST_GROUPS.map((group) => group.id)

/** The four questions sent with every request. Keys are ours; Jev answers under the same keys. */
export const JEV_QUESTIONS = {
  team: {
    type: 'choice',
    instructions:
      'Which hospital team should handle this request from a patient in a hospital bed?',
    criteria: TEAM_CRITERIA,
  },
  clinical: {
    type: 'noul',
    instructions:
      "Is this about the patient's health, a symptom, pain, medication or anything medical?",
  },
  urgency: {
    type: 'choice',
    instructions: 'How urgent is this request?',
    criteria: URGENCY_CRITERIA,
  },
  group: {
    type: 'choice',
    instructions: 'Which kind of request is this?',
    criteria: GROUP_CRITERIA,
  },
} as const

const Probability = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))

const choiceAnswer = <const Labels extends ReadonlyArray<string>>(labels: Labels) =>
  Schema.Struct({
    type: Schema.Literal('choice'),
    choice: Schema.Literals(labels),
    probabilities: Schema.Record(Schema.String, Schema.Finite),
    confidence: Probability,
  })

/** The parts of the response we rely on. Unknown extra fields are ignored. */
export const JevResponse = Schema.Struct({
  model: Schema.String,
  answers: Schema.Struct({
    team: choiceAnswer(TEAMS),
    clinical: Schema.Struct({ type: Schema.Literal('noul'), noul: Probability }),
    urgency: choiceAnswer(URGENCIES),
    group: choiceAnswer(GROUP_IDS),
  }),
})

/** Jev's answers, flattened. */
export interface JevAnswers {
  /** The model version that answered, e.g. "jev-1.13.0". */
  readonly model: string
  readonly team: Team
  /** Jev's confidence in the team choice, 0..1. */
  readonly teamConfidence: number
  /** How clinical the request is, 0..1 (the "noul" answer). */
  readonly clinical: number
  readonly urgency: Urgency
  /** The home-screen request group (REQUEST_GROUPS id) this request belongs to. */
  readonly group: GroupId
}

export class Jev extends Context.Service<
  Jev,
  {
    readonly classify: (
      state: string,
    ) => Effect.Effect<JevAnswers, RouterRateLimited | RouterInvalidOutput | RouterModelFailure>
  }
>()('@bell/core/Jev') {}

/** A Jev provider. It fails to build with RouterNotConfigured when there is no API key. */
export type JevLayer = Layer.Layer<Jev, RouterNotConfigured>

export interface JevOptions {
  /** classifyRequest() falls back to the TYPESAFE_API_KEY env var. */
  readonly apiKey?: string | undefined
  /** Defaults to DEFAULT_JEV_MODEL (env TYPESAFE_MODEL in classifyRequest()). */
  readonly model?: string | undefined
  /** Defaults to TYPESAFE_API_BASE (env TYPESAFE_API_BASE in classifyRequest()). */
  readonly baseUrl?: string | undefined
  /** Custom fetch (tests, proxies). Defaults to globalThis.fetch. */
  readonly fetch?: typeof globalThis.fetch | undefined
}

/** "https://api.typesafe.ai", ".../", or ".../v1" all resolve to ".../v1/systemone". */
export const jevEndpoint = (baseUrl: string): string =>
  `${baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/systemone`

const toAnswers = (response: typeof JevResponse.Type): JevAnswers => ({
  model: response.model,
  team: response.answers.team.choice,
  teamConfidence: response.answers.team.confidence,
  clinical: response.answers.clinical.noul,
  urgency: response.answers.urgency.choice,
  group: response.answers.group.choice,
})

/** Non-2xx responses: 429 and 529 (overloaded) are rate limits, everything else an error. */
const okOrFail = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<HttpClientResponse.HttpClientResponse, RouterRateLimited | RouterModelFailure> => {
  if (response.status >= 200 && response.status < 300) return Effect.succeed(response)
  return response.text.pipe(
    Effect.orElseSucceed(() => ''),
    Effect.flatMap((body) => {
      const message = `Jev HTTP ${response.status}${body.length > 0 ? `: ${oneLine(body, 200)}` : ''}`
      return Effect.fail(
        response.status === 429 || response.status === 529
          ? new RouterRateLimited({ message })
          : new RouterModelFailure({ message }),
      )
    }),
  )
}

const fromHttpClientError = (
  error: HttpClientError.HttpClientError,
): RouterInvalidOutput | RouterModelFailure => {
  const message = `Jev ${error.reason._tag}: ${error.message}`
  switch (error.reason._tag) {
    case 'DecodeError':
    case 'EmptyBodyError':
      return new RouterInvalidOutput({ message })
    case 'TransportError':
    case 'EncodeError':
    case 'InvalidUrlError':
    case 'StatusCodeError':
      return new RouterModelFailure({ message })
  }
}

/** Jev over HTTP. Without an API key the layer fails with RouterNotConfigured (no network). */
export const makeJevLayer = (options: JevOptions): JevLayer => {
  const apiKey = options.apiKey?.trim()
  if (apiKey === undefined || apiKey.length === 0) {
    return Layer.effect(
      Jev,
      Effect.fail(new RouterNotConfigured({ message: 'TYPESAFE_API_KEY is not set' })),
    )
  }
  const url = jevEndpoint(options.baseUrl ?? TYPESAFE_API_BASE)
  const model = options.model ?? DEFAULT_JEV_MODEL
  const token = Redacted.make(apiKey)
  const httpClient =
    options.fetch === undefined
      ? FetchHttpClient.layer
      : FetchHttpClient.layer.pipe(
          Layer.provide(Layer.succeed(FetchHttpClient.Fetch, options.fetch)),
        )

  return Layer.effect(
    Jev,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const decode = HttpClientResponse.schemaBodyJson(JevResponse)

      const classify = (state: string) =>
        HttpClientRequest.post(url).pipe(
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.acceptJson,
          HttpClientRequest.bodyJsonUnsafe({ model, state, questions: JEV_QUESTIONS }),
          client.execute,
          Effect.flatMap(okOrFail),
          Effect.flatMap(decode),
          Effect.map(toAnswers),
          Effect.catchTags({
            HttpClientError: (error) => Effect.fail(fromHttpClientError(error)),
            SchemaError: (error) =>
              Effect.fail(new RouterInvalidOutput({ message: `Jev response: ${error.message}` })),
          }),
        )

      return Jev.of({ classify })
    }),
  ).pipe(Layer.provide(httpClient))
}
