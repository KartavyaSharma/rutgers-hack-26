import type { IncomingItem, RequestChannel } from '@bell/core/staff-api'
import { ago } from '@/lib/time'

const channelLabel: Record<RequestChannel, string> = {
  voice: 'By voice',
  typed: 'Typed',
  button: 'Tapped',
}

export const firstName = (name: string) => name.split(' ')[0] ?? name

/** "By voice · 22 min ago" */
export const askedMeta = (item: IncomingItem) =>
  `${channelLabel[item.channel]} · ${ago(item.askedAt)}`

/** "Lee Martin", "Lee Martin and Sam Kim", "Lee Martin, Sam Kim and Jo Turner". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
