// Display labels for chart times, in the unit's time zone (BELL_TIME_ZONE, else the server's).

export interface Labels {
  now: Date
  /** "15:14" */
  clock(iso: string): string
  /** Calendar days from today: -1 yesterday, 0 today, 1 tomorrow. */
  dayDiff(iso: string): number
  /** "08:00", "16:00 yesterday", "08:00 tomorrow". */
  when(iso: string): string
}

const safeZone = (timeZone: string | undefined) => {
  if (!timeZone) return undefined
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone })
    return timeZone
  } catch {
    return undefined
  }
}

export function labels(timeZone?: string, now = new Date()): Labels {
  const zone = safeZone(timeZone)
  const clockFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const dayNumber = (d: Date) => Date.parse(`${dayFmt.format(d)}T00:00:00Z`) / 86_400_000
  const today = dayNumber(now)
  const clock = (iso: string) => clockFmt.format(new Date(iso))
  const dayDiff = (iso: string) => Math.round(dayNumber(new Date(iso)) - today)
  return {
    now,
    clock,
    dayDiff,
    when(iso) {
      const diff = dayDiff(iso)
      if (diff === 0) return clock(iso)
      if (diff === -1) return `${clock(iso)} yesterday`
      if (diff === 1) return `${clock(iso)} tomorrow`
      return `${clock(iso)}, ${Math.abs(diff)} days ${diff < 0 ? 'ago' : 'from now'}`
    },
  }
}
