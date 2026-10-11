// Short, plain time labels for the staff screens.

/** "now", "4 min ago", "2 h ago", "yesterday". */
export function ago(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return hours < 48 ? 'yesterday' : `${Math.round(hours / 24)} days ago`
}

/** 24-hour clock, "15:14". */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
