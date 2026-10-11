import type { CSSProperties } from 'react'
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { ramp, s } from '../lib/time'
import { BellMark } from './logo'

/**
 * The brand colors the captions, lockup and mark read. The tablet's tokens.css already defines
 * them; the staff video's palette doesn't (its --muted is a fill), so it sets these on the
 * caption and lockup containers.
 */
export const BRAND_VARS = {
  '--ink': '#2B2622',
  '--muted': '#6B6058',
  '--surface': '#FBF8F3',
  '--action': '#A44A2C',
  '--action-ink': '#A44A2C',
  '--on-action': '#FFFFFF',
  fontFamily: '"Atkinson Hyperlegible", system-ui, sans-serif',
} as CSSProperties

/** The Bell mark and name, with one line under it. */
export function Lockup({
  line,
  outAt,
  rings,
}: {
  line: string
  outAt?: number
  /** Frames where the bell rings. */
  rings?: readonly number[]
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const mark = spring({ frame, fps, config: { damping: 14, mass: 0.7 } })
  const name = spring({ frame: frame - 6, fps, config: { damping: 200 } })
  const tagline = spring({ frame: frame - 18, fps, config: { damping: 200 } })
  const leave = outAt === undefined ? 0 : ramp(frame, outAt, outAt + s(0.5))

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: 34,
        opacity: 1 - leave,
        transform: `scale(${1 - leave * 0.03})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
        <div style={{ transform: `scale(${0.6 + mark * 0.4})`, opacity: Math.min(1, mark * 1.4) }}>
          <BellMark size={112} {...(rings ? { rings } : {})} />
        </div>
        <span
          style={{
            fontSize: 132,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: 'var(--ink)',
            opacity: name,
            transform: `translateX(${(1 - name) * -16}px)`,
          }}
        >
          Bell
        </span>
      </div>
      <p
        style={{
          fontSize: 40,
          color: 'var(--muted)',
          opacity: tagline,
          transform: `translateY(${(1 - tagline) * 14}px)`,
        }}
      >
        {line}
      </p>
    </AbsoluteFill>
  )
}
