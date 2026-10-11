import { useCurrentFrame, useVideoConfig } from 'remotion'

/** One ring: a damped swing, `t` seconds after it starts. */
const swing = (t: number) => (t < 0 ? 0 : Math.exp(-t / 0.55) * Math.sin(t * Math.PI * 2 * 2.4))

/**
 * The Bell mark: a terracotta tile with Lucide's `bell-ring` (ISC license) drawn inline, so the
 * bell and its ring waves can move apart. With `rings`, the bell swings from its top at each
 * listed frame and the waves flash out on each swing.
 */
export function BellMark({ size = 96, rings = [] }: { size?: number; rings?: readonly number[] }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const motion = rings.reduce((sum, at) => sum + swing((frame - at) / fps), 0)
  // How hard it is ringing right now, 0..1, for the waves.
  const energy = Math.min(
    1,
    rings.reduce((sum, at) => sum + (frame < at ? 0 : Math.exp(-(frame - at) / fps / 0.55)), 0),
  )
  const wave = (side: -1 | 1) => {
    // Each wave flashes when the bell's mouth swings toward its side (a clockwise turn about
    // the top moves the mouth left).
    const toward = Math.max(0, -motion * side)
    return {
      opacity: rings.length === 0 ? 1 : Math.min(1, 0.5 + energy * 0.2 + toward * 1.4),
      transform: `translateX(${side * toward * 1.4}px)`,
      transformBox: 'view-box' as const,
    }
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: 'var(--action)',
        color: 'var(--on-action)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.58}
        height={size * 0.58}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ overflow: 'visible' }}
      >
        <g
          style={{
            transform: `rotate(${motion * 16}deg)`,
            transformOrigin: '12px 2.5px',
            transformBox: 'view-box',
          }}
        >
          <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
          {/* The clapper lags the bell a little. */}
          <g
            style={{
              transform: `rotate(${motion * -10}deg)`,
              transformOrigin: '12px 17px',
              transformBox: 'view-box',
            }}
          >
            <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          </g>
        </g>
        <path d="M4 2C2.8 3.7 2 5.7 2 8" style={wave(-1)} />
        <path d="M22 8c0-2.3-.8-4.3-2-6" style={wave(1)} />
      </svg>
    </div>
  )
}
