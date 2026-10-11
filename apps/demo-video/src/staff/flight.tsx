import type { ReactNode } from 'react'
import { Easing, interpolate, useCurrentFrame } from 'remotion'

export interface Point {
  x: number
  y: number
}

/**
 * Something carried from one screen to the other: it rises out of `from`, arcs over, and settles
 * into `to`, turning from its first look (`start`) into its second (`end`) on the way. A dotted
 * trail draws behind it and fades once it lands. Stage coordinates; frames are local.
 */
export function Flight({
  from,
  to,
  at,
  until,
  scale,
  width,
  start,
  end,
}: {
  from: Point
  to: Point
  at: number
  until: number
  /** Size at the start and the end, to match each screen's scale. */
  scale: [number, number]
  /** Width of the card in its own pixels. */
  width: number
  start: ReactNode
  end: ReactNode
}) {
  const frame = useCurrentFrame()
  if (frame < at || frame > until + 24) return null
  const t = interpolate(frame, [at, until], [0, 1], {
    easing: Easing.bezier(0.45, 0, 0.15, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  // A gentle arc above the straight line.
  const lift = Math.min(260, Math.hypot(to.x - from.x, to.y - from.y) * 0.32)
  const c = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift }
  const along = (u: number) => ({
    x: (1 - u) ** 2 * from.x + 2 * (1 - u) * u * c.x + u ** 2 * to.x,
    y: (1 - u) ** 2 * from.y + 2 * (1 - u) * u * c.y + u ** 2 * to.y,
  })
  const p = along(t)
  const size = scale[0] + (scale[1] - scale[0]) * t
  // A small lift off the first screen, then it settles into the second.
  const pop = 1 + Math.sin(t * Math.PI) * 0.08
  const appear = interpolate(frame, [at, at + 5], [0, 1], { extrapolateRight: 'clamp' })
  const landed = interpolate(frame, [until - 2, until + 6], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const morph = interpolate(t, [0.3, 0.7], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const trail = interpolate(frame, [until, until + 24], [0.55, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const path = `M ${from.x} ${from.y} Q ${c.x} ${c.y} ${to.x} ${to.y}`

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
        <defs>
          <mask id={`trail-${at}`} maskUnits="userSpaceOnUse">
            <path
              d={path}
              pathLength={1}
              fill="none"
              stroke="white"
              strokeWidth={8}
              strokeDasharray={`${t} 1`}
            />
          </mask>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="#A44A2C"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="0.5 11"
          mask={`url(#trail-${at})`}
          opacity={trail}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: p.x,
          top: p.y,
          width,
          transform: `translate(-50%, -50%) scale(${size * pop})`,
          opacity: appear * landed,
          filter: `drop-shadow(0 ${18 * Math.sin(t * Math.PI)}px 28px rgba(60,42,30,${0.12 + 0.18 * Math.sin(t * Math.PI)}))`,
        }}
      >
        <div style={{ position: 'relative' }}>
          <div style={{ opacity: 1 - morph }}>{start}</div>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: morph }}>
            {end}
          </div>
        </div>
      </div>
    </div>
  )
}
