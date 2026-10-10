import { subscriberCount } from '@/lib/server/bus'
import { json } from '@/lib/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/health: liveness for render.yaml's healthCheckPath, plus open SSE streams. No DB access. */
export function GET() {
  return json({ ok: true, streams: subscriberCount() })
}
