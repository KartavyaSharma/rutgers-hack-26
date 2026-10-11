import { Easing, interpolate } from 'remotion'

export const FPS = 30

/** Seconds to frames. The whole timeline is written in seconds. */
export const s = (seconds: number): number => Math.round(seconds * FPS)

/** 0 → 1 between two frames, eased, clamped on both sides. */
export const ramp = (
  frame: number,
  from: number,
  to: number,
  easing = Easing.bezier(0.25, 0.1, 0.25, 1),
) =>
  interpolate(frame, [from, to], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

/** The last entry whose `at` has passed: a value that changes in steps over time. */
export const stepAt = <T>(
  frame: number,
  steps: readonly { at: number; value: T }[],
  initial: T,
): T => {
  let value = initial
  for (const step of steps) if (frame >= step.at) value = step.value
  return value
}

/** The first `count` words of `text`, for speech that appears as it is said. */
export const wordsUpTo = (text: string, count: number): string =>
  text.split(' ').slice(0, Math.max(0, count)).join(' ')

export const wordCount = (text: string): number => text.split(' ').length
