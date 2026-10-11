import { isLanguageCode } from '@bell/core/taxonomy'
import { json } from '@/lib/server/http'
import { screenText } from '@/lib/server/ui-text'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/ui-text/:language: the tablet's screen words, translated live (English keys). */
export async function GET(_req: Request, props: { params: Promise<{ language: string }> }) {
  const { language } = await props.params
  if (!isLanguageCode(language) || language === 'en') return json({})
  return json(await screenText(language))
}
