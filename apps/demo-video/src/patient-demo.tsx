import { loadFont } from '@remotion/google-fonts/AtkinsonHyperlegible'
import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { ramp, s } from './lib/time'
import { EMERGENCY_LENGTH, emergencyCaptions, emergencyScript } from './scenes/emergency'
import { type SceneScript, SceneView } from './scenes/scene-view'
import { TOUCH_LENGTH, touchCaptions, touchScript } from './scenes/touch'
import { VOICE_LENGTH, voiceCaptions, voiceScript } from './scenes/voice'
import { Caption, type CaptionProps } from './stage/caption'
import { BEZEL, Device } from './stage/device'
import { Lockup } from './stage/lockup'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './tablet/tablet-screen'

loadFont('normal', { weights: ['400', '700'], subsets: ['latin'] })

export { FPS } from './lib/time'

/** Crossfade between scenes on the tablet. */
const SCENE_FADE = s(0.5)

const INTRO_LENGTH = s(3.4)
const VOICE_START = s(2.8)
const EMERGENCY_START = VOICE_START + VOICE_LENGTH - SCENE_FADE
const TOUCH_START = EMERGENCY_START + EMERGENCY_LENGTH - SCENE_FADE
const OUTRO_START = TOUCH_START + TOUCH_LENGTH - s(0.6)
const OUTRO_LENGTH = s(4.4)

export const DURATION = OUTRO_START + OUTRO_LENGTH

const SCENES: { start: number; length: number; script: SceneScript; captions: CaptionCue[] }[] = [
  { start: VOICE_START, length: VOICE_LENGTH, script: voiceScript, captions: voiceCaptions },
  {
    start: EMERGENCY_START,
    length: EMERGENCY_LENGTH,
    script: emergencyScript,
    captions: emergencyCaptions,
  },
  { start: TOUCH_START, length: TOUCH_LENGTH, script: touchScript, captions: touchCaptions },
]

/** Each caption is gone by its `to`, so the next one rises into a clear space. */
type CaptionCue = Omit<CaptionProps, 'outAt'> & { from: number; to: number }
const CAPTION_OUT = 12

// Stage layout (1920×1080): captions on the left, the tablet on the right.
const DEVICE_SCALE = 0.92
const DEVICE_WIDTH = (SCREEN_WIDTH + BEZEL * 2) * DEVICE_SCALE
const DEVICE_HEIGHT = (SCREEN_HEIGHT + BEZEL * 2) * DEVICE_SCALE
const DEVICE_RIGHT = 104
const CAPTION_LEFT = 128
const CAPTION_WIDTH = 1920 - DEVICE_RIGHT - DEVICE_WIDTH - CAPTION_LEFT - 84

export function PatientDemo() {
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #F7F3ED 0%, #EFE8DF 100%)' }}>
      <Sequence durationInFrames={INTRO_LENGTH} name="Intro">
        <Lockup line="Ask for anything, in your own words." outAt={s(2.3)} />
      </Sequence>

      <Sequence
        from={VOICE_START}
        durationInFrames={OUTRO_START + s(0.8) - VOICE_START}
        name="Tablet"
      >
        <Tablet exitAt={OUTRO_START - VOICE_START} />
      </Sequence>

      {SCENES.flatMap((scene) =>
        scene.captions.map((cue) => (
          <Sequence
            key={`${scene.start}-${cue.from}`}
            from={scene.start + cue.from}
            durationInFrames={cue.to - cue.from}
            name={cue.title}
          >
            <AbsoluteFill
              style={{
                left: CAPTION_LEFT,
                width: CAPTION_WIDTH,
                justifyContent: 'center',
              }}
            >
              <Caption {...cue} outAt={cue.to - cue.from - CAPTION_OUT} />
            </AbsoluteFill>
          </Sequence>
        )),
      )}

      <Sequence from={OUTRO_START} name="Outro">
        {/* The bell rings twice as the video closes. */}
        <Lockup line="Every request, heard." rings={[s(0.5), s(2.2)]} />
      </Sequence>
    </AbsoluteFill>
  )
}

/** The tablet: rises in, plays the scenes back to back (crossfaded), and sinks away at the end. */
function Tablet({ exitAt }: { exitAt: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame, fps, config: { damping: 200, mass: 1.2 } })
  const exit = ramp(frame, exitAt, exitAt + s(0.7))

  return (
    <div
      style={{
        position: 'absolute',
        right: DEVICE_RIGHT,
        top: (1080 - DEVICE_HEIGHT) / 2,
        width: DEVICE_WIDTH,
        height: DEVICE_HEIGHT,
        opacity: enter * (1 - exit),
        transform: `translateY(${(1 - enter) * 140 + exit * 40}px) scale(${1 - exit * 0.04})`,
      }}
    >
      <Device style={{ transform: `scale(${DEVICE_SCALE})`, transformOrigin: 'top left' }}>
        {SCENES.map((scene, i) => (
          <Sequence
            key={scene.start}
            from={scene.start - VOICE_START}
            durationInFrames={scene.length}
            name={`Screen ${i + 1}`}
            layout="none"
          >
            <SceneFade fadeIn={i > 0}>
              <SceneView script={scene.script} />
            </SceneFade>
          </Sequence>
        ))}
      </Device>
    </div>
  )
}

function SceneFade({ fadeIn, children }: { fadeIn: boolean; children: ReactNode }) {
  const frame = useCurrentFrame()
  return (
    <div
      style={{ position: 'absolute', inset: 0, opacity: fadeIn ? ramp(frame, 0, SCENE_FADE) : 1 }}
    >
      {children}
    </div>
  )
}
