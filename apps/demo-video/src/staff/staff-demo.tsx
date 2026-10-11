import { loadFont as loadAtkinson } from '@remotion/google-fonts/AtkinsonHyperlegible'
import { loadFont as loadInter } from '@remotion/google-fonts/Inter'
import { Volume2Icon } from 'lucide-react'
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { RequestCard } from '@/components/incoming/request-card'
import { ramp, s } from '../lib/time'
import { Caption } from '../stage/caption'
import { BEZEL, Device, SCREEN_HEIGHT, SCREEN_WIDTH } from '../stage/device'
import { BRAND_VARS, Lockup } from '../stage/lockup'
import { STORY } from '../story'
import { ruthChest } from './data'
import { Flight } from './flight'
import { STAFF_LENGTH, staffCaptions, staffScript } from './script'
import { StaffSceneView } from './staff-scene'
import { STAFF_HEIGHT, STAFF_WIDTH } from './staff-screen'
import { AppWindow, TITLE_BAR } from './window'

loadAtkinson('normal', { weights: ['400', '700'], subsets: ['latin'] })
loadInter('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] })

const INTRO_LENGTH = s(3.4)
const SCREEN_START = s(2.8)
const OUTRO_START = SCREEN_START + STAFF_LENGTH - s(0.6)
const OUTRO_LENGTH = s(4.4)

export const STAFF_DURATION = OUTRO_START + OUTRO_LENGTH

/** Each caption is gone by its `to`, so the next one rises into a clear space. */
const CAPTION_OUT = 12

// Stage layout (1920×1080): the window on the right; on the left the captions, with Ruth's
// tablet below them for the two bedside moments.
const WINDOW_SCALE = 0.8
const WINDOW_WIDTH = STAFF_WIDTH * WINDOW_SCALE
const WINDOW_HEIGHT = (STAFF_HEIGHT + TITLE_BAR) * WINDOW_SCALE
const WINDOW_RIGHT = 84
const WINDOW_TOP = (1080 - WINDOW_HEIGHT) / 2
const CAPTION_LEFT = 120
const CAPTION_TOP = WINDOW_TOP
const CAPTION_WIDTH = 1920 - WINDOW_RIGHT - WINDOW_WIDTH - CAPTION_LEFT - 72
const TABLET_SCALE = 0.46
const TABLET_HEIGHT = (SCREEN_HEIGHT + BEZEL * 2) * TABLET_SCALE
const TABLET_TOP = WINDOW_TOP + WINDOW_HEIGHT - TABLET_HEIGHT

/** Where things leave and land, in stage pixels (screen point × scale + where the screen sits). */
const onTablet = (x: number, y: number) => ({
  x: CAPTION_LEFT + (BEZEL + x) * TABLET_SCALE,
  y: TABLET_TOP + (BEZEL + y) * TABLET_SCALE,
})
const onWindow = (x: number, y: number) => ({
  x: 1920 - WINDOW_RIGHT - WINDOW_WIDTH + x * WINDOW_SCALE,
  y: WINDOW_TOP + (TITLE_BAR + y) * WINDOW_SCALE,
})

export function StaffDemo() {
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #F7F3ED 0%, #EFE8DF 100%)' }}>
      <Sequence durationInFrames={INTRO_LENGTH} name="Intro">
        <AbsoluteFill style={BRAND_VARS}>
          <Lockup line="For the people answering the call." outAt={s(2.3)} />
        </AbsoluteFill>
      </Sequence>

      <Sequence
        from={SCREEN_START}
        durationInFrames={OUTRO_START + s(0.8) - SCREEN_START}
        name="Window"
      >
        <Screen exitAt={OUTRO_START - SCREEN_START} />
      </Sequence>

      <Sequence
        from={SCREEN_START}
        durationInFrames={STORY.tabletGone + s(0.6)}
        name="Ruth's tablet"
      >
        <RuthTablet />
      </Sequence>

      {staffCaptions.map((cue) => (
        <Sequence
          key={cue.from}
          from={SCREEN_START + cue.from}
          durationInFrames={cue.to - cue.from}
          name={cue.title}
        >
          <AbsoluteFill
            style={{
              ...BRAND_VARS,
              left: CAPTION_LEFT,
              width: CAPTION_WIDTH,
              top: CAPTION_TOP,
              bottom: 'auto',
            }}
          >
            <Caption {...cue} outAt={cue.to - cue.from - CAPTION_OUT} />
          </AbsoluteFill>
        </Sequence>
      ))}

      <Sequence from={SCREEN_START} durationInFrames={STORY.told + s(1)} name="Flights">
        {/* Ruth's words leave her tablet and land at the top of Priya's queue as the urgent card. */}
        <Flight
          from={onTablet(420, 160)}
          to={onWindow(204, 183)}
          at={STORY.flyOut}
          until={STORY.arrive}
          scale={[0.5, WINDOW_SCALE]}
          width={336}
          start={
            <SpokenBubble from="patient">
              “My chest feels tight and it’s getting worse.”
            </SpokenBubble>
          }
          end={<RequestCard item={ruthChest()} selected={false} onSelect={() => {}} />}
        />
        {/* Once Priya approves, Bell's message goes back to the bedside. */}
        <Flight
          from={onWindow(680, 742)}
          to={onTablet(250, 600)}
          at={STORY.flyBack}
          until={STORY.told}
          scale={[WINDOW_SCALE, 0.5]}
          width={360}
          start={
            <div className="flex items-center gap-2 rounded-full bg-foreground px-5 py-3 font-sans text-sm font-medium whitespace-nowrap text-background">
              <Volume2Icon className="size-4" />
              Telling Ruth that Priya is on her way
            </div>
          }
          end={<SpokenBubble from="agent">Your nurse Priya is on her way right now.</SpokenBubble>}
        />
      </Sequence>

      <Sequence from={OUTRO_START} name="Outro">
        <AbsoluteFill style={BRAND_VARS}>
          {/* The bell rings twice as the video closes. */}
          <Lockup line="Every request, handled." rings={[s(0.5), s(2.2)]} />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  )
}

/** The window: rises in, plays the take, and sinks away at the end. */
function Screen({ exitAt }: { exitAt: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({ frame, fps, config: { damping: 200, mass: 1.2 } })
  const exit = ramp(frame, exitAt, exitAt + s(0.7))
  return (
    <div
      style={{
        position: 'absolute',
        right: WINDOW_RIGHT,
        top: WINDOW_TOP,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        opacity: enter * (1 - exit),
        transform: `translateY(${(1 - enter) * 140 + exit * 40}px) scale(${1 - exit * 0.04})`,
      }}
    >
      <AppWindow style={{ transform: `scale(${WINDOW_SCALE})`, transformOrigin: 'top left' }}>
        <StaffSceneView script={staffScript} />
      </AppWindow>
    </div>
  )
}

/**
 * Ruth's tablet under the captions: the clip rendered from the patient bundle
 * (`pnpm clips`, src/scenes/ruth.ts), in sync with this timeline. It is shown for her request
 * and again when Bell tells her Priya is coming.
 */
function RuthTablet() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const first = spring({ frame: frame - s(0.3), fps, config: { damping: 200 } })
  const second = spring({ frame: frame - STORY.tabletBackIn, fps, config: { damping: 200 } })
  const shown =
    frame < STORY.tabletBackIn
      ? first * (1 - ramp(frame, STORY.tabletOut, STORY.tabletOut + s(0.5)))
      : second * (1 - ramp(frame, STORY.tabletGone, STORY.tabletGone + s(0.5)))
  if (shown <= 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: CAPTION_LEFT,
        top: TABLET_TOP,
        opacity: shown,
        transform: `translateY(${(1 - shown) * 30}px)`,
      }}
    >
      <Device style={{ transform: `scale(${TABLET_SCALE})`, transformOrigin: 'top left' }}>
        <OffthreadVideo
          src={staticFile('generated/ruth-tablet.mp4')}
          muted
          style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, display: 'block' }}
        />
      </Device>
    </div>
  )
}

/** A chat bubble as the tablet draws it: the patient's on the right, Bell's on the left. */
function SpokenBubble({ from, children }: { from: 'patient' | 'agent'; children: string }) {
  return (
    <p
      style={{
        margin: 0,
        padding: '12px 20px',
        borderRadius: 32,
        [from === 'patient' ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 22,
        background: from === 'patient' ? '#F2E2D6' : '#FBF8F3',
        color: '#2B2622',
        fontFamily: '"Atkinson Hyperlegible", system-ui, sans-serif',
        fontSize: 20,
        lineHeight: 1.4,
      }}
    >
      {children}
    </p>
  )
}
