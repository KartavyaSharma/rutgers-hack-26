// Tablet screen words for languages without a hand-written table: translated on first use by
// Qwen on Cerebras (the AI Gateway as backup), then kept in memory and in .data/ui-text.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CEREBRAS_BASE_URL, DEFAULT_CEREBRAS_MODEL } from '@bell/core'
import { type LanguageCode, LANGUAGES } from '@bell/core/taxonomy'
import ENGLISH_KEYS from '@/lib/patient/translations/zh.json'

type Table = Record<string, string>

const STRINGS = Object.keys(ENGLISH_KEYS)
const CACHE_DIR = join(process.cwd(), '.data', 'ui-text')
const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1'
const GATEWAY_MODEL = 'alibaba/qwen3.8-27b'
/** Strings per call; the chunks run in parallel. */
const CHUNK = 60
const TIMEOUT_MS = 20_000

const read = (name: string): string | undefined => process.env[name]?.trim() || undefined
const memory = new Map<string, Promise<Table>>()

const prompt = (language: string, strings: readonly string[]) =>
  [
    `Translate these strings from a hospital bedside call-bell tablet from English into ${language}.`,
    'Patients read them, often while unwell: keep them short, plain and kind. Use the polite everyday register.',
    'Keep {slots} such as {n} or {name} exactly as they are. Keep “Hey Bell” in English (it is the wake phrase).',
    'Reply with only a JSON object mapping each English string, exactly as given, to its translation.',
    '',
    JSON.stringify(strings),
  ].join('\n')

const providers = () => {
  const list: { url: string; key: string; model: string; extra: object }[] = []
  const cerebras = read('CEREBRAS_API_KEY')
  if (cerebras) {
    list.push({
      url: `${read('CEREBRAS_BASE_URL') ?? CEREBRAS_BASE_URL}/chat/completions`,
      key: cerebras,
      model: read('CEREBRAS_MODEL') ?? DEFAULT_CEREBRAS_MODEL,
      extra: { reasoning_effort: 'none' },
    })
  }
  const gateway = read('AI_GATEWAY_API_KEY')
  if (gateway) {
    list.push({
      url: `${read('AI_GATEWAY_BASE_URL') ?? GATEWAY_URL}/chat/completions`,
      key: gateway,
      model: GATEWAY_MODEL,
      extra: { reasoning: { effort: 'none' } },
    })
  }
  return list
}

const translateChunk = async (language: string, strings: readonly string[]): Promise<Table> => {
  for (const p of providers()) {
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt(language, strings) }],
          ...p.extra,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const text = (body.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '')
      const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Table
      const out: Table = {}
      for (const s of strings) if (typeof json[s] === 'string' && json[s].trim()) out[s] = json[s].trim()
      return out
    } catch (error) {
      console.error(`[ui-text] ${language} via ${p.url}:`, error instanceof Error ? error.message : error)
    }
  }
  return {}
}

const build = async (code: LanguageCode): Promise<Table> => {
  const file = join(CACHE_DIR, `${code}.json`)
  const cached: Table = await readFile(file, 'utf8')
    .then((text) => JSON.parse(text) as Table)
    .catch(() => ({}))
  const missing = STRINGS.filter((s) => !cached[s])
  if (missing.length === 0) return cached
  const label = LANGUAGES.find((l) => l.code === code)?.label ?? code
  const chunks: string[][] = []
  for (let i = 0; i < missing.length; i += CHUNK) chunks.push(missing.slice(i, i + CHUNK))
  const table = Object.assign({}, cached, ...(await Promise.all(chunks.map((c) => translateChunk(label, c)))))
  await mkdir(CACHE_DIR, { recursive: true })
    .then(() => writeFile(file, JSON.stringify(table, null, 2)))
    .catch(() => {})
  return table
}

/** The screen words for one language. A partial table is fine: missing strings stay English. */
export const screenText = (code: LanguageCode): Promise<Table> => {
  let pending = memory.get(code)
  if (!pending) {
    pending = build(code)
    memory.set(code, pending)
    // Not everything came back: try the rest again on the next request.
    void pending.then((table) => {
      if (Object.keys(table).length < STRINGS.length) memory.delete(code)
    })
  }
  return pending
}
