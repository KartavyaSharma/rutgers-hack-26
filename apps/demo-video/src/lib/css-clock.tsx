import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'

/**
 * The UI's CSS keyframe animations (the listening ripples, the "Request sent" drain) run on the
 * wall clock, which a frame-by-frame render can't see. This pauses every animation under it and
 * seeks it to the frame, counted from `from` (the frame the animated element appears). Nested
 * clocks each own their own subtree.
 */
export function CssClock({ from = 0, children }: { from?: number; children: ReactNode }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    for (const animation of root.getAnimations({ subtree: true })) {
      const target = (animation.effect as KeyframeEffect | null)?.target
      if (target?.closest('[data-css-clock]') !== root) continue
      animation.pause()
      animation.currentTime = (Math.max(0, frame - from) / fps) * 1000
    }
  })

  return (
    <div ref={ref} data-css-clock="" style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
