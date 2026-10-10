// Plain data and types shared by web, agent and the router.
// No Effect imports here: client components import this file via `@bell/core/taxonomy`.

export const TEAMS = ['nurse', 'care_aide', 'housekeeping', 'facilities', 'food', 'it'] as const
export type Team = (typeof TEAMS)[number]

export const TEAM_LABELS: Record<Team, string> = {
  nurse: 'Nurse',
  care_aide: 'Care aide',
  housekeeping: 'Housekeeping',
  facilities: 'Facilities',
  food: 'Food services',
  it: 'IT help',
}

export const isTeam = (value: unknown): value is Team =>
  typeof value === 'string' && (TEAMS as readonly string[]).includes(value)

export const URGENCIES = ['urgent', 'soon', 'routine'] as const
export type Urgency = (typeof URGENCIES)[number]

export const URGENCY_LABELS: Record<Urgency, string> = {
  urgent: 'Urgent',
  soon: 'Soon',
  routine: 'Routine',
}

/** What the router decides for a piece of free text (typed or spoken). */
export interface RoutingDecision {
  team: Team
  /**
   * Machine-friendly label. From Jev it is a request GroupId (water_food, bathroom, comfort,
   * reposition, beeping, cleaning, fix_something, ask_care_team) so the tablet can pick an icon;
   * other sources may use free labels (e.g. "nurse_call").
   */
  category: string
  urgency: Urgency
  clinical: boolean
  /** 0..1 */
  confidence: number
  /** One line for staff screens, in English. */
  staffSummary: string
  /** Read-back for the patient in their language ("An extra pillow."), or the nurse_notified line when it went straight to the nurse. Never names a team. */
  patientReply: string
  /** BCP-47-ish language code of the patient's text, e.g. "en", "es". */
  language: string
}

/** Why the router landed where it did. Everything except "model" means the nurse got it as a safety fallback. */
export const ROUTE_REASONS = [
  'model',
  'red_flag',
  'clinical',
  'low_confidence',
  'timeout',
  'rate_limited',
  'invalid_output',
  'error',
  'not_configured',
  'empty_input',
] as const
export type RouteReason = (typeof ROUTE_REASONS)[number]

/** Return type of the public routeText(). */
export interface RouteResult extends RoutingDecision {
  reason: RouteReason
}

/** Request lifecycle. The patient sees the first four as steps; cancelled ends it early. */
export const REQUEST_STATUSES = ['sent', 'seen', 'on_the_way', 'done', 'cancelled'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/** The four steps shown to the patient (Sent, Seen, On the way, Done). */
export const REQUEST_STEPS = [
  'sent',
  'seen',
  'on_the_way',
  'done',
] as const satisfies readonly RequestStatus[]

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  sent: 'Sent',
  seen: 'Seen',
  on_the_way: 'On the way',
  done: 'Done',
  cancelled: 'Cancelled',
}

/** Open = still waiting for staff. */
export const isOpenStatus = (status: RequestStatus): boolean =>
  status !== 'done' && status !== 'cancelled'

/** How a request was made: a fixed-destination button on the screen, the nurse button, typed text or voice. */
export const REQUEST_SOURCES = ['tile', 'nurse_button', 'typed', 'voice'] as const
export type RequestSource = (typeof REQUEST_SOURCES)[number]

/** A stored request, as returned by the web API and pushed over SSE (dates are ISO strings). */
export interface CallRequest {
  id: string
  roomId: string
  team: Team
  category: string
  urgency: Urgency
  clinical: boolean
  source: RequestSource
  /** The request option the patient tapped (source "tile"), else null. */
  optionId: OptionId | null
  /** Original typed or spoken text (null for buttons). */
  text: string | null
  staffSummary: string
  patientReply: string | null
  language: string | null
  confidence: number | null
  routeReason: RouteReason | null
  status: RequestStatus
  createdAt: string
  updatedAt: string
  seenAt: string | null
  claimedAt: string | null
  doneAt: string | null
  cancelledAt: string | null
  /** Last time the patient tapped "Still waiting?". */
  nudgedAt: string | null
  /** What the patient said after an emergency call ("Tell us what's wrong"), oldest first. */
  notes: string[]
}

/** Body for POST /api/requests from a tablet button (no auth). */
export interface ButtonRequestInput {
  roomId: string
  source: 'tile' | 'nurse_button'
  /** Required when source is "tile". */
  optionId?: OptionId
}

/** Body for POST /api/requests from the voice agent (Authorization: Bearer AGENT_SHARED_SECRET). */
export interface RoutedRequestInput {
  roomId: string
  source: 'voice'
  text: string
  decision: RouteResult
}

/**
 * PATCH /api/requests/[id] body `{ action }`:
 * - staff: 'seen' | 'claim' (on the way) | 'done'
 * - patient (tablet): 'cancel' (also "I pressed this by mistake" on the emergency screen) | 'nudge' ("Still waiting?")
 * - agent only (Bearer AGENT_SHARED_SECRET): 'add_note' with `{ text }`, appends to `notes`
 */
export const REQUEST_ACTIONS = ['seen', 'claim', 'done', 'cancel', 'nudge', 'add_note'] as const
export type RequestAction = (typeof REQUEST_ACTIONS)[number]

// ---------------------------------------------------------------------------
// Sending. There is no confirm step: a typed or spoken request is classified and sent right
// away. The patient can change or cancel it afterwards from My requests (PATCH cancel).
// The patient side never names the team; the team stays in the data for the hospital side.
// ---------------------------------------------------------------------------

/**
 * Per route reason: true when the result is a safety fallback to the nurse (red flag, clinical,
 * AI failure), so the patient hears patientMessage("nurse_notified") instead of the normal
 * patientMessage("sent"). One table, so the policy is a one-line change.
 */
export const IMMEDIATE_BY_REASON: Readonly<Record<RouteReason, boolean>> = {
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
}

/** True when the patient should be told the nurse was alerted (vs. a normal "sent"). */
export const needsNurseNow = (result: RouteResult): boolean =>
  result.clinical || IMMEDIATE_BY_REASON[result.reason]

/** POST /api/route response: the request was created. `message` is what to show/say, in the patient's language. */
export interface RouteResponse {
  request: CallRequest
  message: string
}

/** Events on GET /api/stream (SSE `data:` payload, JSON). */
export interface StreamEvent {
  type: 'request.created' | 'request.updated'
  request: CallRequest
}

/**
 * LiveKit RPC the tablet calls on the agent after its Delete button (on the "Request sent" card)
 * cancels requests, so the agent says "Okay, cancelled." Payload: JSON `{ "requestIds": ["..."] }`.
 */
export const REQUESTS_CANCELLED_RPC = 'bell.requests_cancelled'

/** LiveKit agent name used for explicit dispatch from the token endpoint. */
export const AGENT_NAME = 'bell-agent'

// ---------------------------------------------------------------------------
// Languages. Auto-detect is the default. A chosen language is one room setting that flows to the
// speech-to-text hint, the reply language and the text-to-speech language. These are the 85
// languages ElevenLabs Scribe v2 (speech-to-text) transcribes AND eleven_v4_turbo (the voice) can
// speak; Scribe languages the voice can't speak are left out. Shown on the "Change Language"
// screen (search, "Most used", then A to Z). Filipino uses the code 'tl'; Norwegian is 'no'.
// ---------------------------------------------------------------------------

export const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'zh', label: 'Chinese', nativeLabel: '简体中文' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', rtl: true },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski' },
  { code: 'af', label: 'Afrikaans', nativeLabel: 'Afrikaans' },
  { code: 'hy', label: 'Armenian', nativeLabel: 'Հայերեն' },
  { code: 'as', label: 'Assamese', nativeLabel: 'অসমীয়া' },
  { code: 'az', label: 'Azerbaijani', nativeLabel: 'Azərbaycanca' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
  { code: 'bs', label: 'Bosnian', nativeLabel: 'Bosanski' },
  { code: 'bg', label: 'Bulgarian', nativeLabel: 'Български' },
  { code: 'yue', label: 'Cantonese', nativeLabel: '粵語' },
  { code: 'ca', label: 'Catalan', nativeLabel: 'Català' },
  { code: 'cs', label: 'Czech', nativeLabel: 'Čeština' },
  { code: 'da', label: 'Danish', nativeLabel: 'Dansk' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' },
  { code: 'et', label: 'Estonian', nativeLabel: 'Eesti' },
  { code: 'tl', label: 'Filipino', nativeLabel: 'Filipino' },
  { code: 'fi', label: 'Finnish', nativeLabel: 'Suomi' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'gl', label: 'Galician', nativeLabel: 'Galego' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'el', label: 'Greek', nativeLabel: 'Ελληνικά' },
  { code: 'he', label: 'Hebrew', nativeLabel: 'עברית', rtl: true },
  { code: 'hu', label: 'Hungarian', nativeLabel: 'Magyar' },
  { code: 'is', label: 'Icelandic', nativeLabel: 'Íslenska' },
  { code: 'id', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'kk', label: 'Kazakh', nativeLabel: 'Қазақ тілі' },
  { code: 'lv', label: 'Latvian', nativeLabel: 'Latviešu' },
  { code: 'lt', label: 'Lithuanian', nativeLabel: 'Lietuvių' },
  { code: 'mk', label: 'Macedonian', nativeLabel: 'Македонски' },
  { code: 'ms', label: 'Malay', nativeLabel: 'Bahasa Melayu' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
  { code: 'ne', label: 'Nepali', nativeLabel: 'नेपाली' },
  { code: 'no', label: 'Norwegian', nativeLabel: 'Norsk' },
  { code: 'or', label: 'Odia', nativeLabel: 'ଓଡ଼ିଆ' },
  { code: 'fa', label: 'Persian', nativeLabel: 'فارسی', rtl: true },
  { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ' },
  { code: 'ro', label: 'Romanian', nativeLabel: 'Română' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский' },
  { code: 'sk', label: 'Slovak', nativeLabel: 'Slovenčina' },
  { code: 'sl', label: 'Slovenian', nativeLabel: 'Slovenščina' },
  { code: 'sw', label: 'Swahili', nativeLabel: 'Kiswahili' },
  { code: 'sv', label: 'Swedish', nativeLabel: 'Svenska' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'th', label: 'Thai', nativeLabel: 'ไทย' },
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська' },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو', rtl: true },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
  { code: 'ast', label: 'Asturian', nativeLabel: 'Asturianu' },
  { code: 'be', label: 'Belarusian', nativeLabel: 'Беларуская' },
  { code: 'my', label: 'Burmese', nativeLabel: 'မြန်မာ' },
  { code: 'ceb', label: 'Cebuano', nativeLabel: 'Cebuano' },
  { code: 'ny', label: 'Chichewa', nativeLabel: 'Chichewa' },
  { code: 'hr', label: 'Croatian', nativeLabel: 'Hrvatski' },
  { code: 'ka', label: 'Georgian', nativeLabel: 'ქართული' },
  { code: 'ha', label: 'Hausa', nativeLabel: 'Hausa' },
  { code: 'ga', label: 'Irish', nativeLabel: 'Gaeilge' },
  { code: 'jv', label: 'Javanese', nativeLabel: 'Basa Jawa' },
  { code: 'ky', label: 'Kyrgyz', nativeLabel: 'Кыргызча' },
  { code: 'ln', label: 'Lingala', nativeLabel: 'Lingála' },
  { code: 'lb', label: 'Luxembourgish', nativeLabel: 'Lëtzebuergesch' },
  { code: 'mt', label: 'Maltese', nativeLabel: 'Malti' },
  { code: 'mi', label: 'Māori', nativeLabel: 'Te Reo Māori' },
  { code: 'mn', label: 'Mongolian', nativeLabel: 'Монгол' },
  { code: 'oc', label: 'Occitan', nativeLabel: 'Occitan' },
  { code: 'ps', label: 'Pashto', nativeLabel: 'پښتو', rtl: true },
  { code: 'sr', label: 'Serbian', nativeLabel: 'Српски' },
  { code: 'sd', label: 'Sindhi', nativeLabel: 'سنڌي', rtl: true },
  { code: 'so', label: 'Somali', nativeLabel: 'Soomaali' },
  { code: 'tg', label: 'Tajik', nativeLabel: 'Тоҷикӣ' },
  { code: 'uz', label: 'Uzbek', nativeLabel: 'Oʻzbekcha' },
  { code: 'cy', label: 'Welsh', nativeLabel: 'Cymraeg' },
  { code: 'yo', label: 'Yoruba', nativeLabel: 'Yorùbá' },
] as const

/** The "Most used" row on the language screen, in board order. */
export const MOST_USED_LANGUAGES = ['en', 'es', 'zh', 'pt', 'hi', 'gu', 'ko', 'ar'] as const

/** Right-to-left scripts. */
export const isRtlLanguage = (code: string): boolean =>
  LANGUAGES.some((l) => l.code === code && 'rtl' in l)

/** Languages Deepgram Flux (`flux-general-multi`, the fallback STT) understands. */
export const FLUX_LANGUAGES = ['en', 'es', 'fr', 'de', 'hi', 'ru', 'pt', 'ja', 'it', 'nl'] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  typeof value === 'string' && LANGUAGES.some((l) => l.code === value)

/** "auto" means detect from what the patient says or types. */
export type LanguagePreference = LanguageCode | 'auto'

export const isLanguagePreference = (value: unknown): value is LanguagePreference =>
  value === 'auto' || isLanguageCode(value)

// Display themes from the design system. Clay is the default (the chosen Main screens);
// Night is kept for later (night-time scheduling), with no picker on the tablet for now.
export const THEMES = ['clay', 'night'] as const
export type Theme = (typeof THEMES)[number]

export const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value)

/**
 * Per-room settings. The tablet keeps them (localStorage per room for now) and sends the
 * language along with typed text and voice sessions. Night can be scheduled later.
 */
export interface RoomSettings {
  language: LanguagePreference
  theme: Theme
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = { language: 'auto', theme: 'clay' }

/**
 * Job metadata the web token endpoint attaches to the agent dispatch (JSON).
 * mode 'request': the normal "Make a request" conversation.
 * mode 'emergency': opened from the emergency screen after "I need help immediately". The agent says
 * patientMessage("emergency_listening") and appends what the patient says to the
 * emergency request (PATCH add_note) instead of making new requests.
 */
export interface AgentJobMetadata {
  roomId: string
  language: LanguagePreference
  mode: 'request' | 'emergency'
  /** Set when mode is 'emergency'. */
  emergencyRequestId: string | null
}

/** POST /api/livekit/token body. */
export interface VoiceTokenInput {
  roomId: string
  language?: LanguagePreference
  mode?: 'request' | 'emergency'
  emergencyRequestId?: string
}

// Room controls (lights, temperature, blinds, TV) for the "Your room" sheet, backed by the
// RoomControls adapter in @bell/core/adapters (the in-memory simulator for now):
//   GET   /api/rooms/[roomId]/controls -> RoomControlsState
//   PATCH /api/rooms/[roomId]/controls { lights?, temperatureF?, blinds?, tv? } -> RoomControlsState

// ---------------------------------------------------------------------------
// Home screen: up to 8 groups, each with up to 7 plain-word request options.
// Options never call the AI: each one has a fixed destination team.
// The screen can render groups (tap a group, then an option) or flat tiles (a group with a
// single option sends it directly). PLACEHOLDER content built from the original 8 tiles; the
// final list comes from the layout doc.
// ---------------------------------------------------------------------------

export interface RequestOption {
  /** Globally unique across groups. */
  id: string
  label: string
  team: Team
  category: string
  urgency: Urgency
  staffSummary: string
}

export interface RequestGroup {
  id: string
  label: string
  /** Secondary line under the label, if any. */
  hint: string | null
  /** 1..7 options. */
  requests: readonly RequestOption[]
}

export const MAX_GROUPS = 8
export const MAX_OPTIONS_PER_GROUP = 7

const option = (
  id: string,
  label: string,
  team: Team,
  category: string,
  urgency: Urgency,
  staffSummary: string,
) => ({ id, label, team, category, urgency, staffSummary }) as const satisfies RequestOption

export const REQUEST_GROUPS = [
  {
    id: 'water_food',
    label: 'Water & food',
    hint: null,
    requests: [
      option('water', 'Water', 'care_aide', 'water', 'soon', 'Patient would like water'),
      option(
        'ice_chips',
        'Ice chips',
        'care_aide',
        'water',
        'soon',
        'Patient would like ice chips',
      ),
      option(
        'snack',
        'Something to eat',
        'care_aide',
        'food',
        'soon',
        'Patient would like something to eat',
      ),
    ],
  },
  {
    id: 'bathroom',
    label: 'Bathroom help',
    hint: null,
    requests: [
      option(
        'bathroom_help',
        'Help to the bathroom',
        'care_aide',
        'bathroom',
        'soon',
        'Patient needs help getting to the bathroom',
      ),
      option(
        'bedpan',
        'Bedpan or urinal',
        'care_aide',
        'bathroom',
        'soon',
        'Patient needs a bedpan or urinal',
      ),
    ],
  },
  {
    id: 'comfort',
    label: 'Comfort items',
    hint: 'Blanket, pillow, socks',
    requests: [
      option(
        'blanket',
        'Blanket',
        'care_aide',
        'comfort_items',
        'routine',
        'Patient would like a blanket',
      ),
      option(
        'pillow',
        'Pillow',
        'care_aide',
        'comfort_items',
        'routine',
        'Patient would like a pillow',
      ),
      option('socks', 'Socks', 'care_aide', 'comfort_items', 'routine', 'Patient would like socks'),
    ],
  },
  {
    id: 'reposition',
    label: 'Move or sit up',
    hint: null,
    requests: [
      option(
        'sit_up',
        'Sit up',
        'care_aide',
        'reposition',
        'soon',
        'Patient needs help sitting up',
      ),
      option(
        'move_in_bed',
        'Move in bed',
        'care_aide',
        'reposition',
        'soon',
        'Patient needs help moving in bed',
      ),
    ],
  },
  {
    id: 'beeping',
    label: 'Something is beeping',
    hint: null,
    requests: [
      option(
        'beeping',
        'Something is beeping',
        'nurse',
        'device_alarm',
        'soon',
        'A device in the room is beeping',
      ),
    ],
  },
  {
    id: 'cleaning',
    label: 'Cleaning',
    hint: null,
    requests: [
      option(
        'clean_room',
        'Clean my room',
        'housekeeping',
        'cleaning',
        'routine',
        'Room needs cleaning',
      ),
      option(
        'clean_bathroom',
        'Clean the bathroom',
        'housekeeping',
        'cleaning',
        'routine',
        'Bathroom needs cleaning',
      ),
      option(
        'empty_trash',
        'Empty the trash',
        'housekeeping',
        'cleaning',
        'routine',
        'Trash needs emptying',
      ),
    ],
  },
  {
    id: 'fix_something',
    label: 'Fix something',
    hint: 'TV, lights, Wi-Fi',
    requests: [
      option('fix_tv', 'TV', 'facilities', 'repair_tv', 'routine', 'TV needs fixing'),
      option(
        'fix_lights',
        'Lights',
        'facilities',
        'repair_lights',
        'routine',
        'Lights need fixing',
      ),
      option('fix_wifi', 'Wi-Fi', 'facilities', 'repair_wifi', 'routine', 'Wi-Fi is not working'),
    ],
  },
  {
    id: 'ask_care_team',
    label: 'Ask my care team',
    hint: null,
    requests: [
      option(
        'ask_care_team',
        'Ask my care team',
        'nurse',
        'question',
        'routine',
        'Patient has a question for the care team',
      ),
    ],
  },
] as const satisfies readonly RequestGroup[]

export type GroupId = (typeof REQUEST_GROUPS)[number]['id']
export type OptionId = (typeof REQUEST_GROUPS)[number]['requests'][number]['id']

/** Every option across all groups, in screen order. */
export const REQUEST_OPTIONS: readonly (RequestOption & { id: OptionId; groupId: GroupId })[] =
  REQUEST_GROUPS.flatMap((group) =>
    group.requests.map((request) => ({ ...request, groupId: group.id })),
  )

export const OPTION_IDS: readonly OptionId[] = REQUEST_OPTIONS.map((o) => o.id)

export const isOptionId = (value: unknown): value is OptionId =>
  typeof value === 'string' && (OPTION_IDS as readonly string[]).includes(value)

export const isGroupId = (value: unknown): value is GroupId =>
  typeof value === 'string' && REQUEST_GROUPS.some((g) => g.id === value)

export const optionById = (id: OptionId) => {
  const found = REQUEST_OPTIONS.find((o) => o.id === id)
  if (!found) throw new Error(`Unknown request option: ${id}`)
  return found
}

export const groupById = (id: GroupId): RequestGroup => {
  const found = REQUEST_GROUPS.find((g) => g.id === id)
  if (!found) throw new Error(`Unknown request group: ${id}`)
  return found
}

/**
 * The "I need help immediately" button. Always the nurse, urgent, never the AI. The tablet then
 * shows the emergency screen until the request is done or the patient taps "I pressed this by mistake".
 */
export const NURSE_BUTTON = {
  label: 'I need help immediately',
  team: 'nurse',
  category: 'nurse_call',
  urgency: 'urgent',
  staffSummary: 'Patient pressed "I need help immediately"',
} as const satisfies Omit<RequestOption, 'id'>

/**
 * The request group a stored request belongs to, for its icon on the tablet. Jev tags each
 * classified request with a group id as its category; buttons use their option's group.
 */
export const groupOfCategory = (category: string): GroupId | null =>
  isGroupId(category) ? category : null
