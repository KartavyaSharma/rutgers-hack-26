import type { StreamEvent } from '@bell/core/taxonomy'
import type { NextRequest } from 'next/server'
import { subscribe } from '@/lib/server/bus'
import { badRequest } from '@/lib/server/http'
import { parseListQuery } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 15_000

/**
 * GET /api/stream?team=&room= : server-sent events of created/updated requests, plus draft events
 * for room-only subscribers (the tablet).
 */
export async function GET(request: NextRequest) {
  const query = parseListQuery(request.nextUrl.searchParams)
  if (!query.ok) return badRequest(query.message)
  const { team, roomId } = query.value

  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }

      const unsubscribe = subscribe((event: StreamEvent) => {
        if ('draft' in event) {
          // Drafts are the patient's unsent words: only the room's own screen sees them,
          // never a team (staff) stream or an unfiltered one.
          if (!roomId || team || event.draft.roomId !== roomId) return
        } else {
          if (team && event.request.team !== team) return
          if (roomId && event.request.roomId !== roomId) return
        }
        send(`data: ${JSON.stringify(event)}\n\n`)
      })
      const heartbeat = setInterval(() => send(': heartbeat\n\n'), HEARTBEAT_MS)

      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed by the runtime.
        }
      }
      request.signal.addEventListener('abort', cleanup, { once: true })

      // Reconnect delay hint for EventSource, plus an initial comment so proxies flush headers.
      send('retry: 3000\n: connected\n\n')
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform keeps compression middleware from buffering the stream.
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
