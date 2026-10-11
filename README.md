# Bell

A bedside tablet call bell that sends each request to the right hospital team.
The patient taps **Make a request** and speaks, or taps **I need help immediately**.
Spoken requests are classified by Jev (TypeSafe AI) and sent to
the care aide, housekeeping, facilities, food services or IT, and **anything clinical or unclear always goes to the
nurse**. The voice agent holds a normal conversation (Qwen 3.8 on Cerebras) and uses tools to file requests.

## Run it locally

Requirements: Node 22.18+ (`.nvmrc`) and pnpm (`corepack enable pnpm`).

```sh
pnpm install
cp .env.example .env   # optional: everything below works without keys
pnpm dev               # web app on http://localhost:3217 (+ voice agent when its keys are set)
pnpm dev:staff         # optional, second terminal: staff app on http://localhost:3218
```

Open:

- http://localhost:3217/room/412: patient tablet (1024x768 landscape)
- http://localhost:3218: staff app (sign in with `priya@bell.demo` / `bell`; needs `pnpm dev` running)
- http://localhost:3217/staff/care_aide: bare dev view of a team's requests (`nurse`, `care_aide`, `housekeeping`, `facilities`, `food`, `it`)
- http://localhost:3217/design: tokens and components in the Clay and Night themes

For voice, fill in the LiveKit, ElevenLabs, AI Gateway and TypeSafe keys in `.env` (see [Environment](#environment)).
To change ports: `PORT=… pnpm dev` (and match `APP_URL`), `STAFF_PORT=… BELL_API_URL=http://localhost:<PORT> pnpm dev:staff`.

Without any keys: **I need help immediately**, My requests, Your room, the language screens and the staff dev view
work end to end, and Make a request (voice) is disabled. Without `DATABASE_URL`, data is stored with PGlite in
`apps/web/.data/` (no Docker needed). Delete that folder to reset.

| Script | What it does |
| --- | --- |
| `pnpm dev` | web + voice agent together (the agent exits quietly if its keys are missing) |
| `pnpm dev:staff` | staff app (`apps/staff`) on port 3218, proxying the web API |
| `pnpm build` | builds the web app; typechecks the packages |
| `pnpm typecheck` | `tsc` in every workspace |
| `pnpm lint` | Biome |
| `pnpm test` | vitest (router tests use a mocked LLM, no network) |

## Environment

All variables live in one `.env` at the repo root (see `.env.example`). Never commit it.

| Variable | Used by | Notes |
| --- | --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | web, agent | voice sessions; the token endpoint returns 503 without them |
| `AI_GATEWAY_API_KEY` | agent | backup speech to text (MAI-Transcribe-2 via the Vercel AI Gateway, also its live partials) and the conversation LLM |
| `STT_PROVIDER` | agent | `scribe` (default: ElevenLabs Scribe v2 Realtime, uses `ELEVEN_API_KEY`) or `deepgram`; `STT_BACKUP=mai` and `SCRIBE_STALL_MS` (500) control the MAI fallback |
| `DEEPGRAM_API_KEY` | agent | fallback speech to text, Deepgram Flux `flux-general-multi` (10 languages) |
| `ELEVEN_API_KEY`, `ELEVEN_VOICE_ID` | agent | text to speech |
| `ELEVEN_MODEL` | agent | `eleven_v4_turbo` (default, low latency) or `eleven_v4` (higher quality) |
| `TYPESAFE_API_KEY` | web, agent | Jev classifier (team, clinical, urgency); optional `TYPESAFE_MODEL` (default `jev-latest`) |
| `LLM_PROVIDER` | agent | `gateway` (default with the gateway key): Qwen 3.8 27B through the AI Gateway, Cerebras raced against wafer/deepinfra; or `cerebras` (direct) |
| `CEREBRAS_API_KEY` | agent (web: backup router) | direct conversation LLM `qwen-3.8-27b` with `reasoning_effort: "low"` (`CEREBRAS_AGENT_MODEL`, `CEREBRAS_AGENT_REASONING_EFFORT`); also the backup Qwen JSON router (`routeText`) |
| `DATABASE_URL` | web | Postgres; unset means PGlite in `apps/web/.data/` |
| `APP_URL` | agent | where the agent calls the web API, locally `http://localhost:3217` |
| `AGENT_SHARED_SECRET` | web, agent | bearer token the agent uses for routed requests and notes |

## How it works

```
apps/web        Next.js 16 (App Router, Tailwind 4): tablet, staff dev view, API, SSE, Postgres/PGlite via Drizzle
apps/agent      LiveKit Agents (Node): Scribe STT (MAI backup) -> Qwen 3.8 conversation + tools -> Jev -> web API -> ElevenLabs TTS
packages/core   classifier (Effect 4: Jev, plus the backup Qwen router), shared taxonomy/types, localized patient messages, adapter seams
packages/ui     design tokens (tokens.css from the design system) and base components
```

- **The tablet** follows the chosen "Main" screens (Clay look, 1024×768): a header with the room, a Language
  button and a Room button; a big **Make a request** panel (tap to talk); **I need help immediately**; and
  **My requests** cards. Sheets for My requests (steps Sent, Seen, On the way, Done, "Still waiting?", Change,
  Cancel), Language (first run and from the header) and Your room (lights, temperature, blinds, TV).
- **No confirm step.** A spoken request is classified by Jev and sent right away; the tablet shows
  "Request sent. Someone will be with you soon." The patient changes or cancels it afterwards from My requests.
- **I need help immediately** sends an urgent nurse request and opens the emergency screen. It stays up until
  the nurse finishes the request; the only way out is "I pressed this by mistake". The agent listens
  ("Tell us what's wrong, if you can.") and adds what the patient says to that request as notes.
- **The patient side never names a team.** The team lives in the data for the hospital side.
- **Classifier safety order** (`classifyRequest()` in core): red-flag phrases (chest pain, can't breathe, fell,
  bleeding, ... in the 10 room languages) before any AI call; Jev saying clinical; team confidence under 0.8;
  timeout over 2 s, errors, bad output or rate limits. Every path ends on the nurse, and it never rejects. Jev also
  tags each request with its group (water_food, comfort, cleaning, ...) for the tablet's icons.
- **Language**: Auto by default: MAI-Transcribe detects what the patient speaks and the agent replies in it. The
  tablet's Change Language screen (search, "Most used", A to Z) offers the 85 languages Scribe transcribes and the voice can speak
  as a room setting (a hint for speech-to-text, the replies and text-to-speech). Fixed spoken lines exist for all
  85 (16 hand-written, 69 AI-translated and awaiting native review). Instant red-flag phrases cover 16 languages;
  in the others, clinical requests reach the nurse through Jev and the LLM. The theme is Clay (Night is kept in the tokens for later).
- **Voice agent**: tap to talk. The tablet gets a LiveKit token from `POST /api/livekit/token`, which dispatches the
  agent with `{ roomId, language, mode, emergencyRequestId }`. Speech-to-text: a local VAD cuts each utterance (600 ms of silence); ElevenLabs Scribe v2 Realtime
  gives the final text and language ~0.1–0.3 s after that; MAI-Transcribe-2 (Vercel AI Gateway) gives live partials and
  is the backup when Scribe fails, stalls (500 ms) or writes the wrong script.
  Deepgram Flux remains as a fallback (`STT_PROVIDER=deepgram`). The agent's input runs through LiveKit Cloud's
  background voice cancellation (Krisp BVC, `NOISE_CANCELLATION`), so nearby conversations aren't heard, and short
  noises can't interrupt it. Fixed lines ("Go ahead, I'm listening.", "Sent. Someone's coming.") are pre-rendered
  per language so they play instantly. Red-flag phrases
  are caught in code before the LLM and go straight to the nurse. Otherwise Qwen 3.8 (reasoning low, through the AI Gateway: Cerebras first, a steady backup provider raced in
  after 250 ms) keeps it
  terse and conversational, and says a short phrase whenever it calls a tool: `send_request` (Jev classifies in the
  background, then the request is sent), `cancel_request` (corrections, "never mind"), `call_my_nurse`.
  All writes go through the web API (the only writer).

## Hospital-side interface (for now)

What the hospital and its departments need is still open, so the hospital side is this API and feed.
Every request is stored with: room, the tapped option or the patient's words, team, category (request group),
urgency, clinical, confidence, staff summary, language, route reason, status (`sent`, `seen`, `on_the_way`,
`done`, `cancelled`), notes, and timestamps (created, updated, seen, claimed, done, cancelled, nudged).
`/staff/[team]` is a bare dev view of it, not the hospital design.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/requests?team=&room=&status=` | list requests (open ones by default, `status=all` for everything) |
| `GET` | `/api/stream?team=&room=` | server-sent events: `request.created` / `request.updated` |
| `PATCH` | `/api/requests/[id]` | `{ "action": "seen" \| "claim" \| "done" }` or `{ "status": "..." }` |

Real integrations (a nurse call vendor, HL7/FHIR, building controls) would plug in behind the small interfaces in
`packages/core/src/adapters` (`RequestOutlet`, `RoomControls`). Today the outlet is the database and room
controls are an in-memory simulator.

### Tablet and agent API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/requests` | `{ roomId, source: "nurse_button" }` (help), `{ roomId, source: "tile", optionId }`, or a routed request from the agent (bearer) |
| `PATCH` | `/api/requests/[id]` | patient: `{ "action": "cancel" \| "nudge" }`; agent (bearer): `{ "action": "add_note", "text" }` |
| `POST` | `/api/route` | `{ roomId, text, language? }`: classify text and send it right away |
| `GET` / `PATCH` | `/api/rooms/[roomId]/controls` | room lights, temperature, blinds, TV (simulator) |
| `POST` | `/api/livekit/token` | `{ roomId, language?, mode?, emergencyRequestId? }`: LiveKit token + agent dispatch |
| `GET` | `/api/health` | health check |

The design system lives in the claude.ai artifact "Bell Design System"; `packages/ui/src/tokens.css` is copied
from it.

## Deploy

`render.yaml` is a Render Blueprint: the web service plus a Postgres database on the free plan.
The voice agent is meant to run on LiveKit Cloud; a Render worker is included, commented out.
