import type { ConversationAction, ConversationItem } from '@bell/ui'
import { useCurrentFrame } from 'remotion'
import { CssClock } from '../lib/css-clock'
import { ramp } from '../lib/time'
import { Tap } from '../stage/tap'
import { TabletScreen, type TabletState } from '../tablet/tablet-screen'

const CUT_FADE = 8

export interface SceneScript {
  /** What the tablet shows at a (local) frame. */
  stateAt: (frame: number) => TabletState
  /** Frames where the view changes enough to soften with a short crossfade. */
  cuts: readonly number[]
  /** Frames where a CSS animation (ripple, drain) should start counting. */
  clocks: readonly number[]
  taps?: readonly { at: number; find: (screen: HTMLElement) => Element | null }[]
}

const lastAtOrBefore = (frame: number, frames: readonly number[]) =>
  frames.reduce((found, f) => (f <= frame && f > found ? f : found), 0)

/** One scene on the tablet: the scripted state, crossfaded at cuts, with taps drawn on top. */
export function SceneView({ script }: { script: SceneScript }) {
  const frame = useCurrentFrame()
  const cut = lastAtOrBefore(frame, script.cuts)
  const fading = cut > 0 && frame < cut + CUT_FADE
  const clockFrom = lastAtOrBefore(frame, script.clocks)

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {fading ? (
        <div style={{ position: 'absolute', inset: 0 }}>
          <CssClock from={lastAtOrBefore(cut - 1, script.clocks)}>
            <TabletScreen state={script.stateAt(cut - 1)} />
          </CssClock>
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: fading ? ramp(frame, cut, cut + CUT_FADE) : 1,
        }}
      >
        <CssClock from={clockFrom}>
          <TabletScreen state={script.stateAt(frame)}>
            {script.taps?.map((tap) => (
              <Tap key={tap.at} at={tap.at} find={tap.find} />
            ))}
          </TabletScreen>
        </CssClock>
      </div>
    </div>
  )
}

/** Splits speech into the pieces that appear one at a time: words, or characters for Chinese. */
const pieces = (text: string) => (text.includes(' ') ? text.split(' ') : Array.from(text))

export interface Line {
  id: string
  from: 'patient' | 'agent'
  text: string
  /** Frame the first word appears. */
  start: number
  /** Frames per word (or character). */
  pace: number
  actions?: readonly ConversationAction[]
  actionsAt?: number
}

/** The conversation as it stands at `frame`: each line typed out as it is said. */
export function conversationAt(frame: number, lines: readonly Line[]): ConversationItem[] {
  const items: ConversationItem[] = []
  for (const line of lines) {
    if (frame < line.start) continue
    const all = pieces(line.text)
    const count = Math.min(all.length, Math.floor((frame - line.start) / line.pace) + 1)
    const joiner = line.text.includes(' ') ? ' ' : ''
    items.push({
      kind: 'message',
      id: line.id,
      from: line.from,
      text: all.slice(0, count).join(joiner),
      live: line.from === 'patient' && count < all.length,
      ...(line.actions && line.actionsAt !== undefined && frame >= line.actionsAt
        ? { actions: line.actions }
        : {}),
    })
  }
  return items
}

/** When a line has finished appearing. */
export const lineEnd = (line: Line) => line.start + pieces(line.text).length * line.pace
