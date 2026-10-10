# Bell

A bedside tablet call bell that sends each request to the right hospital team.
The patient taps a request, taps **My nurse**, types, or taps the mic and speaks.
Buttons go straight to a fixed team. Typed and spoken requests are classified by Jev (TypeSafe AI) and sent to
the care aide, housekeeping, facilities, food services or IT, and **anything clinical or unclear always goes to the
nurse**. The voice agent holds a normal conversation (Qwen 3.8 on Cerebras) and uses tools to file requests.

## Run it

Requirements: Node 22.18+ and pnpm (via corepack: `corepack enable pnpm`).

```sh
pnpm install
cp .env.example .env   # optional: everything works without keys
pnpm dev               # web on http://localhost:3000 (+ voice agent when keys exist)
```

Port 3000 busy? `PORT=3217 pnpm dev` (and set `APP_URL` to match if you run the voice agent).

Open:

- http://localhost:3000/room/412: patient tablet (1024x768 landscape)
- http://localhost:3000/staff/care_aide: dev view of a team's requests (`nurse`, `care_aide`, `housekeeping`, `facilities`, `food`, `it`). Not the hospital design.
- http://localhost:3000/design: tokens and components in the Linen, Clay and Night themes

Without any keys: request buttons, **My nurse**, typed requests (as nurse drafts) and the staff dev view work
end to end, and the talk button is disabled. Without `DATABASE_URL`, data is stored with PGlite in
`apps/web/.data/` (no Docker needed). Delete that folder to reset.

| Script | What it does |
| --- | --- |
| `pnpm dev` | web + voice agent together (the agent exits quietly if its keys are missing) |
| `pnpm build` | builds the web app; typechecks the packages |
| `pnpm typecheck` | `tsc` in every workspace |
| `pnpm lint` | Biome |
| `pnpm test` | vitest (router tests use a mocked LLM, no network) |

## Environment

All variables live in one `.env` at the repo root (see `.env.example`). Never commit it.

| Variable | Used by | Notes |
| --- | --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | web, agent | voice sessions; the token endpoint returns 503 without them |
| `DEEPGRAM_API_KEY` | agent | speech to text, Deepgram Flux `flux-general-multi` |
| `ELEVEN_API_KEY`, `ELEVEN_VOICE_ID` | agent | text to speech |
| `ELEVEN_MODEL` | agent | `eleven_v4_turbo` (default, low latency) or `eleven_v4` (higher quality) |
| `TYPESAFE_API_KEY` | web, agent | Jev classifier (team, clinical, urgency); optional `TYPESAFE_MODEL` (default `jev-latest`) |
| `CEREBRAS_API_KEY` | agent (web: backup router) | conversation LLM `qwen-3.8-27b` with `reasoning_effort: "high"` (`CEREBRAS_AGENT_MODEL`, `CEREBRAS_AGENT_REASONING_EFFORT`); also the backup Qwen JSON router (`routeText`) |
| `DATABASE_URL` | web | Postgres; unset means PGlite in `apps/web/.data/` |
| `APP_URL` | agent | where the agent calls the web API, e.g. `http://localhost:3000` |
| `AGENT_SHARED_SECRET` | web, agent | bearer token the agent uses for routed requests and drafts |

## How it works

```
apps/web        Next.js 16 (App Router, Tailwind 4): tablet, staff dev view, API, SSE, Postgres/PGlite via Drizzle
apps/agent      LiveKit Agents (Node): Deepgram Flux STT -> Qwen 3.8 conversation + tools -> Jev -> web API -> ElevenLabs TTS
packages/core   classifier (Effect 4: Jev, plus the backup Qwen router), shared taxonomy/types, localized patient messages, adapter seams
packages/ui     design tokens (tokens.css from the design system) and base components
```

- **Buttons skip AI.** The home screen has up to 8 groups, each with up to 7 plain-word requests, and every
  request has a fixed team (`REQUEST_GROUPS` in `packages/core/src/taxonomy.ts`, placeholder content for now).
  A tap sends it. **My nurse** always goes to the nurse.
- **Typed and spoken requests become a draft first.** Jev picks the team, and the patient sees or hears a
  read-back ("An extra pillow. Say yes, or tap Send."). Nothing is sent until they say yes or tap Send, and a draft
  never auto-sends. A "no" or a correction makes a new draft.
- **Except when the nurse is needed now.** Red flags, anything the router marks clinical, and AI failures
  (timeout, error, bad output, rate limit) go to the nurse immediately: "I've let your nurse know."
  One table decides this: `IMMEDIATE_BY_REASON` in the taxonomy. Low confidence becomes a nurse draft.
- **The patient side never names a team.** The team lives in the data for the hospital side.
- **Classifier safety order** (`classifyRequest()` in core): red-flag phrases (chest pain, can't breathe, fell,
  bleeding, ... in the 10 room languages) before any AI call; Jev saying clinical; team confidence under 0.8; timeout
  over 2 s, errors, bad output or rate limits. Every path ends on the nurse. It never rejects.
- **Language and theme are room settings** on the tablet: language is Auto (detected) or one of the 10 Flux
  languages, and flows to the speech-to-text hint, the router's reply language and the text-to-speech language.
  Theme is Linen (default), Clay or Night.
- **Voice**: tap to talk. The tablet gets a LiveKit token from `POST /api/livekit/token`, which dispatches the agent
  with `{ roomId, language }`. Flux's end of turn closes each turn. Red-flag phrases are caught in code before the LLM
  and go straight to the nurse. Otherwise Qwen 3.8 (reasoning high) chats normally and calls tools when there is
  something to do: `classify_and_draft` (async: Jev classifies in the background while the conversation continues,
  then the agent reads back the draft), `confirm_draft`, `cancel_draft`, `call_my_nurse`. All writes go through the
  web API (the only writer). Tapping Send on the tablet confirms through the API and tells the agent over LiveKit RPC
  (`bell.draft_confirmed`).

## Hospital-side interface (for now)

What the hospital and its departments need is still open, so the hospital side is this API and feed.
Every request is stored with: room, the tapped option or the patient's text, team, category, urgency,
clinical, confidence, staff summary, language, route reason, status (`sent`, `seen`, `on_the_way`, `done`)
and timestamps (created, updated, seen, claimed, done).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/requests?team=&room=&status=` | list requests (open ones by default, `status=all` for everything) |
| `GET` | `/api/stream?team=&room=` | server-sent events: `request.created` / `request.updated` (draft events only reach room streams) |
| `PATCH` | `/api/requests/[id]` | `{ "action": "seen" \| "claim" \| "done" }` or `{ "status": "..." }` |

Real integrations (a nurse call vendor, HL7/FHIR, building controls) would plug in behind the small interfaces in
`packages/core/src/adapters` (`RequestOutlet`, `RoomControls`). Today the only outlet is the database.

### Tablet and agent API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/requests` | a button tap `{ roomId, source: "tile", optionId }` or `{ roomId, source: "nurse_button" }`; or an immediate routed request from the agent (bearer) |
| `POST` | `/api/route` | `{ roomId, text, language? }`: route typed text, returns a draft or (nurse now) a sent request |
| `GET` | `/api/drafts?room=&status=` | drafts for a room (pending by default) |
| `POST` | `/api/drafts` | the agent creates a voice draft (bearer) |
| `POST` | `/api/drafts/[id]/confirm` | confirm a draft: saves the request (idempotent) |
| `POST` | `/api/drafts/[id]/discard` | discard a pending draft |
| `POST` | `/api/livekit/token` | `{ roomId, language? }`: LiveKit token + agent dispatch |
| `GET` | `/api/health` | health check |

## Deploy

`render.yaml` is a Render Blueprint: the web service plus a Postgres database on the free plan.
The voice agent is meant to run on LiveKit Cloud; a Render worker is included, commented out.
