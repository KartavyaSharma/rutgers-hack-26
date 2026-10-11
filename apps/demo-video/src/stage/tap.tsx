import { useLayoutEffect, useRef, useState } from 'react'
import { interpolate, useCurrentFrame } from 'remotion'

const SIZE = 64

/**
 * A finger tap on the tablet: a soft disc that settles in, presses at `at`, then lifts with a
 * ring. `find` picks the element to tap; the disc lands on its center (screen coordinates, so it
 * follows the real layout). Render it inside the screen.
 */
export function Tap({ at, find }: { at: number; find: (screen: HTMLElement) => Element | null }) {
  const frame = useCurrentFrame()
  const ref = useRef<HTMLDivElement>(null)
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const screen = ref.current?.closest<HTMLElement>('[data-screen]')
    const target = screen ? find(screen) : null
    if (!screen || !target) return
    const box = screen.getBoundingClientRect()
    const rect = target.getBoundingClientRect()
    const scale = box.width / screen.offsetWidth
    const x = (rect.left + rect.width / 2 - box.left) / scale
    const y = (rect.top + rect.height / 2 - box.top) / scale
    if (!point || point.x !== x || point.y !== y) setPoint({ x, y })
  })

  const t = frame - at
  const opacity = interpolate(t, [-10, -4, 6, 16], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = interpolate(t, [-10, -4, 0, 3, 8], [1.35, 1, 0.82, 0.82, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const ring = interpolate(t, [1, 16], [0.8, 2.1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const ringOpacity = interpolate(t, [1, 4, 16], [0, 0.55, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 60 }}>
      {point && opacity > 0 ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: point.x - SIZE / 2,
              top: point.y - SIZE / 2,
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE,
              border: '3px solid rgba(255,255,255,0.9)',
              transform: `scale(${ring})`,
              opacity: ringOpacity,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: point.x - SIZE / 2,
              top: point.y - SIZE / 2,
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE,
              background: 'rgba(255,255,255,0.55)',
              border: '2px solid rgba(43,38,34,0.18)',
              boxShadow: '0 6px 18px rgba(43,38,34,0.18)',
              backdropFilter: 'blur(2px)',
              transform: `scale(${scale})`,
              opacity,
            }}
          />
        </>
      ) : null}
    </div>
  )
}

/** The first element under `screen` matching `selector` whose text includes `text`. */
export const byText =
  (text: string, selector = 'button') =>
  (screen: HTMLElement): Element | null =>
    [...screen.querySelectorAll(selector)].find((el) => el.textContent?.includes(text)) ?? null
