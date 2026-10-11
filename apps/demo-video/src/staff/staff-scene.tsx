import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { ramp } from '../lib/time'
import { STAFF_HEIGHT, STAFF_WIDTH, StaffScreen, type StaffState } from './staff-screen'

const CUT_FADE = 6

type Finder = (screen: HTMLElement) => Element | null

export interface StaffScript {
  stateAt: (frame: number) => StaffState
  /** Frames where the page changes enough to soften with a short crossfade. */
  cuts: readonly number[]
  /** Pointer clicks: the cursor glides to the element and clicks at `at`. */
  clicks: readonly { at: number; find: Finder }[]
  /** Zoom keyframes on the window content; `find` is the element to center on, `x` overrides
   * its horizontal center (for wide elements). */
  camera: readonly { at: number; zoom: number; find?: Finder; x?: number }[]
  toasts: readonly { at: number; text: string }[]
  /** A soft ring around something new. */
  highlights: readonly { from: number; to: number; find: Finder }[]
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const lastAtOrBefore = (frame: number, frames: readonly number[]) =>
  frames.reduce((found, f) => (f <= frame && f > found ? f : found), 0)

/** Where an element sits inside a screen root, in screen pixels (whatever the transforms). */
const boxIn = (root: HTMLElement, el: Element | null): Box | null => {
  if (!el) return null
  const r = root.getBoundingClientRect()
  const e = el.getBoundingClientRect()
  const scale = r.width / root.offsetWidth
  return {
    x: (e.left - r.left) / scale,
    y: (e.top - r.top) / scale,
    w: e.width / scale,
    h: e.height / scale,
  }
}

/**
 * Where every click and camera target is, measured once per mount on hidden copies of the
 * screen at the frame each one happens. Every frame then knows all positions, even for elements
 * that are gone by then, so a render that starts mid-scene moves the cursor the same way.
 */
function useTargets(script: StaffScript) {
  const probes = [
    ...script.clicks.map((c) => ({ frame: Math.max(0, c.at - 1), find: c.find })),
    ...script.camera.map((c) => ({ frame: c.at, find: c.find })),
    ...script.highlights.map((h) => ({ frame: h.from, find: h.find })),
  ]
  const [boxes, setBoxes] = useState<(Box | null)[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (boxes || !ref.current) return
    const roots = [...ref.current.querySelectorAll<HTMLElement>('[data-probe]')]
    setBoxes(
      probes.map((p, i) => {
        const root = roots[i]?.querySelector<HTMLElement>('[data-staff-screen]')
        return root && p.find ? boxIn(root, p.find(root)) : null
      }),
    )
  })
  const probeLayer = boxes ? null : (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none' }}
    >
      {probes.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: one probe per target, fixed list
        <div key={i} data-probe="" style={{ position: 'absolute', inset: 0 }}>
          <StaffScreen state={script.stateAt(p.frame)} />
        </div>
      ))}
    </div>
  )
  const nClicks = script.clicks.length
  const nCamera = script.camera.length
  return {
    probeLayer,
    clickBoxes: boxes?.slice(0, nClicks) ?? [],
    cameraBoxes: boxes?.slice(nClicks, nClicks + nCamera) ?? [],
    highlightBoxes: boxes?.slice(nClicks + nCamera) ?? [],
  }
}

/** The staff app in one continuous take: crossfaded page changes, camera, cursor and toasts. */
export function StaffSceneView({ script }: { script: StaffScript }) {
  const frame = useCurrentFrame()
  const { probeLayer, clickBoxes, cameraBoxes, highlightBoxes } = useTargets(script)
  const cut = lastAtOrBefore(frame, script.cuts)
  const fading = cut > 0 && frame < cut + CUT_FADE

  // Camera: zoom eases between keyframes, centred on the keyframe's element.
  const cam = cameraAt(frame, script.camera, cameraBoxes)

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: '0 0',
          transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.zoom})`,
        }}
      >
        {fading ? (
          <div style={{ position: 'absolute', inset: 0 }}>
            <StaffScreen state={script.stateAt(cut - 1)} />
          </div>
        ) : null}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: fading ? ramp(frame, cut, cut + CUT_FADE) : 1,
          }}
        >
          <StaffScreen state={script.stateAt(frame)} />
        </div>
        {script.highlights.map((h, i) => (
          <Highlight key={h.from} box={highlightBoxes[i] ?? null} from={h.from} to={h.to} />
        ))}
        <Cursor clicks={script.clicks} boxes={clickBoxes} />
        {probeLayer}
      </div>
      <Toasts toasts={script.toasts} />
    </div>
  )
}

function cameraAt(frame: number, keys: StaffScript['camera'], boxes: (Box | null)[]) {
  const point = (i: number) => {
    const b = boxes[i]
    const x = keys[i]?.x
    return b
      ? { x: x ?? b.x + b.w / 2, y: b.y + b.h / 2 }
      : { x: x ?? STAFF_WIDTH / 2, y: STAFF_HEIGHT / 2 }
  }
  // Translate so the focus point lands where it would sit in a zoomed, clamped view.
  const place = (zoom: number, x: number, y: number) => {
    const tx = Math.min(0, Math.max(STAFF_WIDTH - STAFF_WIDTH * zoom, STAFF_WIDTH / 2 - x * zoom))
    const ty = Math.min(
      0,
      Math.max(STAFF_HEIGHT - STAFF_HEIGHT * zoom, STAFF_HEIGHT / 2 - y * zoom),
    )
    return { zoom, tx, ty }
  }
  if (keys.length === 0) return { zoom: 1, tx: 0, ty: 0 }
  let i = 0
  while (i + 1 < keys.length && (keys[i + 1]?.at ?? Infinity) <= frame) i++
  const a = keys[i]
  const b = keys[i + 1]
  if (!a) return { zoom: 1, tx: 0, ty: 0 }
  const pa = place(a.zoom, point(i).x, point(i).y)
  if (!b || frame <= a.at) return frame < a.at ? { zoom: 1, tx: 0, ty: 0 } : pa
  // Each move takes 0.8 s, ending at the next keyframe.
  const pb = place(b.zoom, point(i + 1).x, point(i + 1).y)
  const t = interpolate(frame, [b.at - 24, b.at], [0, 1], {
    easing: Easing.bezier(0.45, 0, 0.2, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return {
    zoom: pa.zoom + (pb.zoom - pa.zoom) * t,
    tx: pa.tx + (pb.tx - pa.tx) * t,
    ty: pa.ty + (pb.ty - pa.ty) * t,
  }
}

const MOVE = 20

/** A pointer that glides to each click target, presses, and leaves a small ring. */
function Cursor({ clicks, boxes }: { clicks: StaffScript['clicks']; boxes: (Box | null)[] }) {
  const frame = useCurrentFrame()
  if (boxes.length === 0) return null
  const at = (i: number) => {
    const b = boxes[i]
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null
  }
  const rest = { x: STAFF_WIDTH * 0.62, y: STAFF_HEIGHT * 0.7 }
  let pos = rest
  let lastClick = -Infinity
  for (let i = 0; i < clicks.length; i++) {
    const c = clicks[i]
    const target = at(i)
    if (!c || !target) continue
    const start = c.at - MOVE - 4
    if (frame < start) break
    const t = interpolate(frame, [start, c.at - 4], [0, 1], {
      easing: Easing.bezier(0.5, 0, 0.2, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    pos = { x: pos.x + (target.x - pos.x) * t, y: pos.y + (target.y - pos.y) * t }
    if (frame >= c.at - 3) lastClick = c.at
  }
  const since = frame - lastClick
  const press = interpolate(since, [-3, 0, 4], [1, 0.82, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const ring = interpolate(since, [0, 14], [0.4, 1.6], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const ringOpacity = interpolate(since, [0, 3, 14], [0, 0.45, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 80 }}>
      <div
        style={{
          position: 'absolute',
          left: pos.x - 22,
          top: pos.y - 22,
          width: 44,
          height: 44,
          borderRadius: 44,
          background: 'rgba(42,38,34,0.25)',
          transform: `scale(${ring})`,
          opacity: ringOpacity,
        }}
      />
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: pos.x - 5,
          top: pos.y - 3,
          transform: `scale(${press})`,
          transformOrigin: '5px 3px',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.25))',
        }}
        aria-hidden="true"
      >
        <path
          d="M5 3l14 8.2-6.3 1.3 3.6 6.9-2.6 1.3-3.6-6.9L5 18.4z"
          fill="#1d1b19"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function Highlight({ box, from, to }: { box: Box | null; from: number; to: number }) {
  const frame = useCurrentFrame()
  if (!box || frame < from || frame > to) return null
  const opacity = interpolate(frame, [from, from + 6, to - 10, to], [0, 1, 1, 0])
  const grow = interpolate(frame, [from, from + 14], [8, 4], { extrapolateRight: 'clamp' })
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x - grow,
        top: box.y - grow,
        width: box.w + grow * 2,
        height: box.h + grow * 2,
        borderRadius: 14,
        boxShadow: '0 0 0 3px rgba(181,73,45,0.55), 0 0 28px 6px rgba(181,73,45,0.25)',
        opacity,
        pointerEvents: 'none',
        zIndex: 70,
      }}
    />
  )
}

/** The staff app's sonner toast (one ink pill, bottom center), shown for 2.4 s. */
function Toasts({ toasts }: { toasts: StaffScript['toasts'] }) {
  const frame = useCurrentFrame()
  const current = toasts.filter((t) => frame >= t.at && frame < t.at + 72).at(-1)
  if (!current) return null
  const since = frame - current.at
  const enter = ramp(since, 0, 10)
  const leave = ramp(since, 62, 72)
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 96,
        display: 'flex',
        justifyContent: 'center',
        opacity: enter * (1 - leave),
        transform: `translateY(${(1 - enter) * 16}px)`,
        zIndex: 90,
      }}
    >
      <ToastPill>{current.text}</ToastPill>
    </div>
  )
}

function ToastPill({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-foreground px-5 py-3 font-sans text-sm font-medium text-background shadow-lg">
      {children}
    </div>
  )
}
