import { Schema } from 'effect'
import { type RoutingDecision, TEAMS, URGENCIES } from './taxonomy'

/**
 * The structured output schema sent to the model (Cerebras strict JSON-schema mode).
 *
 * Cerebras supports a limited subset of JSON Schema, so this stays deliberately plain:
 * string enums, strings, numbers, booleans, every field required, no extra properties.
 * `Schema.Finite` (not `Schema.Number`) keeps the number field a bare `{ "type": "number" }`
 * instead of an `anyOf` that also allows "NaN"/"Infinity" strings.
 * Ranges the model schema can't express are enforced by `RoutingDecisionSchema` after decoding.
 */
export const ModelRoutingDecision = Schema.Struct({
  team: Schema.Literals(TEAMS),
  category: Schema.String,
  urgency: Schema.Literals(URGENCIES),
  clinical: Schema.Boolean,
  confidence: Schema.Finite,
  staffSummary: Schema.String,
  patientReply: Schema.String.annotate({
    description:
      'Short read-back of what the patient asked for, in their language, e.g. "An extra pillow." Never names a team and never says it was sent.',
  }),
  language: Schema.String,
})

/** Full validation of a model decision, applied after the model output has been decoded. */
export const RoutingDecisionSchema = Schema.Struct({
  ...ModelRoutingDecision.fields,
  confidence: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
})

// Compile-time check: the decoded schema type must stay identical to the plain
// `RoutingDecision` interface in taxonomy.ts (ignoring readonly modifiers).
type Mutable<T> = { -readonly [K in keyof T]: T[K] }
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const schemaMatchesTaxonomy: Equals<
  Mutable<typeof RoutingDecisionSchema.Type>,
  RoutingDecision
> = true
const modelSchemaMatchesTaxonomy: Equals<
  Mutable<typeof ModelRoutingDecision.Type>,
  RoutingDecision
> = true
void schemaMatchesTaxonomy
void modelSchemaMatchesTaxonomy
