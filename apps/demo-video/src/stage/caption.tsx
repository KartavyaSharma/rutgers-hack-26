import { Icon } from '@bell/ui'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { ramp } from '../lib/time'

export interface CaptionProps {
  eyebrow?: string
  title: string
  body?: string
  /** Something said out loud, shown as a pill under the body from frame `from` (local). */
  quote?: { text: string; from: number; note?: string }
  /** Local frame the caption starts leaving; it is gone 12 frames later. */
  outAt: number
}

/** The words beside the tablet: eyebrow, headline, one line of body. Rises in, fades out. */
export function Caption({ eyebrow, title, body, quote, outAt }: CaptionProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.8 } })
  const leave = ramp(frame, outAt, outAt + 12)
  const line = (delay: number) => {
    const p = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.8 } })
    return { opacity: p, transform: `translateY(${(1 - p) * 18}px)` }
  }

  return (
    <div
      style={{
        opacity: (1 - leave) * enter,
        transform: `translateY(${leave * -14}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      {eyebrow ? (
        <p style={{ ...line(0), fontSize: 26, fontWeight: 700, color: 'var(--action-ink)' }}>
          {eyebrow}
        </p>
      ) : null}
      <h2
        style={{
          ...line(3),
          fontSize: 66,
          fontWeight: 700,
          lineHeight: 1.04,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
          textWrap: 'balance',
        }}
      >
        {title}
      </h2>
      {body ? (
        <p
          style={{
            ...line(7),
            fontSize: 29,
            lineHeight: 1.38,
            color: 'var(--muted)',
            textWrap: 'pretty',
          }}
        >
          {body}
        </p>
      ) : null}
      {quote ? <Quote {...quote} /> : null}
    </div>
  )
}

/** A spoken line: mic, live level bars, the words. */
function Quote({ text, from, note }: { text: string; from: number; note?: string }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = spring({ frame: frame - from, fps, config: { damping: 200 } })
  if (frame < from) return null
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * 14}px)`,
        marginTop: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '12px 28px 12px 12px',
          borderRadius: 999,
          background: 'var(--surface)',
          boxShadow: '0 10px 30px -14px rgba(60,42,30,0.35)',
        }}
      >
        <span
          style={{
            width: 52,
            height: 52,
            borderRadius: 52,
            background: 'var(--action)',
            color: 'var(--on-action)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="mic" className="size-7" />
        </span>
        <Bars frame={frame - from} />
        <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--ink)' }}>{text}</span>
      </div>
      {note ? (
        <span style={{ fontSize: 24, color: 'var(--muted)', paddingLeft: 14 }}>{note}</span>
      ) : null}
    </div>
  )
}

function Bars({ frame }: { frame: number }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, height: 32 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const h = interpolate(
          Math.sin(frame / 3.2 + i * 1.3) * Math.cos(frame / 5 + i),
          [-1, 1],
          [8, 30],
        )
        return (
          <span
            key={i}
            style={{ width: 5, height: h, borderRadius: 5, background: 'var(--action)' }}
          />
        )
      })}
    </span>
  )
}
