import { confirmDraft } from '@/lib/server/drafts'
import { json, notFound, serverError } from '@/lib/server/http'
import { isUuid } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/drafts/[id]/confirm -> { draft, request }. No auth: the tablet and the agent both call it.
 * Idempotent: 201 when this call created the request, 200 when it was already confirmed,
 * 409 when the draft was discarded.
 */
export async function POST(_request: Request, ctx: RouteContext<'/api/drafts/[id]/confirm'>) {
  const { id } = await ctx.params
  if (!isUuid(id)) return notFound('Draft not found')

  try {
    const result = await confirmDraft(id)
    switch (result.kind) {
      case 'not_found':
        return notFound('Draft not found')
      case 'discarded':
        return json(
          { error: 'conflict', message: 'This draft was discarded', draft: result.draft },
          409,
        )
      case 'already_confirmed':
        return json({ draft: result.draft, request: result.request })
      case 'confirmed':
        return json({ draft: result.draft, request: result.request }, 201)
    }
  } catch (error) {
    return serverError(error, 'confirm draft')
  }
}
