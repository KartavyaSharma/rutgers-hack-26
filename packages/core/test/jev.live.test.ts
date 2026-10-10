// Real calls to Jev. Skipped unless LIVE=1 and TYPESAFE_API_KEY is set (the repo-root .env is
// loaded when LIVE=1). Run: LIVE=1 pnpm --filter @bell/core exec vitest run test/jev.live.test.ts
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { classifyRequest, IMMEDIATE_BY_REASON, type RouteReason } from '../src'

const live = process.env.LIVE === '1'
if (live && !process.env.TYPESAFE_API_KEY) {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)))
  } catch {
    // No .env: the suite stays skipped.
  }
}
const enabled = live && Boolean(process.env.TYPESAFE_API_KEY?.trim())

const FAILURES: ReadonlyArray<RouteReason> = [
  'timeout',
  'rate_limited',
  'invalid_output',
  'error',
  'not_configured',
]

describe.skipIf(!enabled)('Jev live', () => {
  it.each([
    ['can I get another blanket', 'care_aide', 'model'],
    ['the TV remote is broken', 'facilities', 'model'],
    ['I feel sick to my stomach after my new medication', 'nurse', 'clinical'],
  ] as const)(
    '%j -> %s (%s)',
    async (text, team, reason) => {
      const started = Date.now()
      const result = await classifyRequest({ text }, { timeoutMs: 5000 })
      const ms = Date.now() - started
      console.log(
        `[jev live] ${JSON.stringify(text)} -> team=${result.team} reason=${result.reason} ` +
          `confidence=${result.confidence.toFixed(2)} urgency=${result.urgency} ${ms}ms`,
      )
      expect(FAILURES).not.toContain(result.reason)
      expect(result.team).toBe(team)
      expect(result.reason).toBe(reason)
      expect(IMMEDIATE_BY_REASON[result.reason]).toBe(reason === 'clinical')
    },
    10_000,
  )
})
