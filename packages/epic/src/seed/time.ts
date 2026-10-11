// Seed times are written as the design canvas shows them, around a "now" of 15:15, and shifted
// to the real now at load time so the demo always looks live.

const CANVAS_NOW = 15 * 60 + 15

/** "14:30" (today), "yesterday 16:00", "tomorrow 08:00" or "-2d 21:00". */
export type When = string

export type Clock = (when: When) => string

export const canvasClock =
  (now: Date): Clock =>
  (when) => {
    const m = /^(?:(yesterday|tomorrow|-?\d+d) )?(\d{2}):(\d{2})$/.exec(when)
    if (!m) throw new Error(`Bad seed time: ${when}`)
    const day =
      m[1] === 'yesterday' ? -1 : m[1] === 'tomorrow' ? 1 : m[1] ? Number.parseInt(m[1], 10) : 0
    const minutes = day * 1440 + Number(m[2]) * 60 + Number(m[3]) - CANVAS_NOW
    return new Date(now.getTime() + minutes * 60_000).toISOString()
  }

/** For a series of today's vitals: a bare time later than the canvas now means yesterday. */
export const recent = (when: When): When => {
  const m = /^(\d{2}):(\d{2})$/.exec(when)
  return m && Number(m[1]) * 60 + Number(m[2]) > CANVAS_NOW ? `yesterday ${when}` : when
}
