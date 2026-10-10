import { discardDraft } from '@/lib/server/drafts'
import { json, notFound, serverError } from '@/lib/server/http'
import { isUuid } from '@/lib/server/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/drafts/[id]/discard -> { draft }. Pending only; discarding twice is fine; 409 if confirmed. */
export async function POST(_request: Request, ctx: RouteContext<'/api/drafts/[id]/discard'>) {
  const { id } = await ctx.params
  if (!isUuid(id)) return notFound('Draft not found')

  try {
    const result = await discardDraft(id)
    switch (result.kind) {
      case 'not_found':
        return notFound('Draft not found')
      case 'already_confirmed':
        return json(
          { error: 'conflict', message: 'This draft was already sent', draft: result.draft },
          409,
        )
      case 'discarded':
        return json({ draft: result.draft })
    }
  } catch (error) {
    return serverError(error, 'discard draft')
  }
}
